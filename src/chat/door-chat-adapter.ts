import { readPluginGuide, readUiAuthoringGuide, SelectionGuide } from "./plugin-guide";
import { readCanvasResponse } from "../json-render/references/canvas-contract";
import { catalogPresentationMessage, referenceChatResponse } from "../json-render/references/reference-chat";
/**
 * ChatAdapter backed by the :8090 door.
 *
 * Every call is one `PluginService/CallMethod`. The provider menu reads the
 * sealed `model_registry`; chat and selection stay on `tched_router`.
 * Method names, argument shapes and capability ids are copied from the live
 * sealed schema (`zcall help`); if a reseal changes them the bridge refuses
 * the call and the refusal is surfaced verbatim.
 */
import { startKnowledgeFeed, type KnowledgeFeed, type KnowledgePush } from "./knowledge-feed";
import type { DoorbellStatus } from "./doorbell";
import {
  getChatContext,
  getNotebook,
  listNotebooks,
  listProjects,
  selectChatMode,
  selectNotebook,
  type NotebookDetail,
  type NotebookSummary,
  type ProjectSummary,
  type ResolvedChatContext,
  type SelectModeRequest,
} from "./chat-mode";
import type { DoorIdentity } from "../grpc/door";
import type {
  ChatAdapter,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ProviderOption,
  RouteSelection,
} from "./chat-adapter";
import { DoorClient, DoorError, type DoorConfig } from "../grpc/door";
import { PluginFeedStore } from "../grpc/plugin-feeds";
import { listCatalog, refreshCatalog, type CatalogModel, type CatalogProvider } from "./model-catalog";
import { uiGallery, type UiGallery } from "./ui-gallery";
import {
  authorizeTask,
  currentControlPlaneModel,
  setControlPlaneModel,
  verifiedControlPlaneModel,
} from "./control-plane-model";
import { applyCatalogModelBinding, resolveCatalogModelBinding, sameCatalogModelBinding, verifiedAccountabilityModel } from "./native-routing";
import { loadCommittedCatalogRoute } from "./router-committed-route";
import type { AuthorizeTask, Elevate } from "./elevation";
import { binaryMethods, type BinaryMethod } from "./threetchedfs-surface";

export const TCHED_ROUTER = "tched_router";

/** Method → declared capability, from the sealed tched_router schema. */
export const TCHED_ROUTER_METHODS = {
  SetSelection: "cap.software.tched-router.selection.set@v1",
  ResolveCatalogModelBinding: "cap.software.tched-router.model.binding.read@v1",
  ApplyCatalogModelBinding: "cap.software.tched-router.catalog.selection.set@v1",
  Chat: "cap.software.3tched-router.chat@v1",
} as const;

interface ChatOutput {
  content: string;
  provider: string;
  model: string;
  finish_reason: string;
  usage: unknown;
}

function roleForWire(role: ChatMessage["role"]): string {
  return role === "agent" ? "assistant" : role;
}

function catalogOptions(providers: CatalogProvider[], models: CatalogModel[]): ProviderOption[] {
  const configured = providers.filter((provider) => provider.configured && provider.enabled && provider.provider_id);
  return configured.map((provider) => {
    const own = models.filter((model) => model.provider_id === provider.provider_id && model.model_id);
    const available = own.filter((model) => model.available);
    const ordered = available.length > 0 ? [...available, ...own.filter((model) => !model.available)] : own;
    return {
      id: provider.provider_id,
      label: provider.name?.trim() || provider.provider_id,
      auth: provider.auth ?? undefined,
      endpoint: provider.endpoint ?? undefined,
      sdk: provider.sdk ?? undefined,
      models: ordered.map((model) => ({
        id: model.model_id,
        ...(!model.available ? { available: false } : {}),
        label: model.name?.trim() || model.model_id,
        detail: [
          model.context_length ? `${model.context_length} ctx` : "",
          model.available ? "" : "unavailable",
        ].filter(Boolean).join(" · "),
        auth: model.auth ?? undefined,
        endpoint: model.endpoint ?? undefined,
        sdk: model.sdk ?? undefined,
      })),
    };
  });
}

/**
 * A chat turn runs the router's agent loop against an upstream model; the
 * bridge allows it up to 600s. Give the browser a generous deadline so a slow
 * turn surfaces as a reply, not a client-side timeout.
 */
const CHAT_TIMEOUT_MS = 300_000;

let responseSequence = 0;

export interface DoorChatAdapter extends ChatAdapter {
  readonly kind: "remote";
  readonly door: string;
  readonly committedRoute: RouteSelection | null;
  readonly routeInitiallyApplied: boolean;
  /** The verified caller's mounted ZeroClaw filesystem. */
  readonly binarySurface: {
    describe(): Promise<BinaryMethod[]>;
    invoke(method: BinaryMethod, args: Record<string, unknown>, confirmSideEffects: boolean): Promise<unknown>;
  };
  /** Swap the carried credential (OIA1 renewal) without reconnecting. */
  setIdentity(identity: DoorIdentity): void;
  /**
   * Follow this session's knowledge pushes: an initial read through the
   * door, then a re-read on every doorbell wake. Returns a stop function.
   */
  followKnowledge(
    onKnowledge: (pushes: KnowledgePush[], revision: number) => void,
    onStatus?: (status: DoorbellStatus) => void,
  ): () => void;
  /** The session's selected chat mode, as the door resolves it. */
  getChatContext(): Promise<ResolvedChatContext>;
  /** Select a mode for this session; the door validates and persists it. */
  selectChatMode(request: SelectModeRequest): Promise<ResolvedChatContext>;
  /** Projects this principal may select. */
  listProjects(): Promise<ProjectSummary[]>;
  /** Notebooks this principal may bind to NotebookLM mode. */
  listNotebooks(): Promise<NotebookSummary[]>;
  /** Persist the notebook, then the caller selects notebook_lm mode. */
  selectNotebook(notebookId: string): Promise<void>;
  /** Sources and title for the notebook shown under the chat. */
  getNotebook(notebookId: string): Promise<NotebookDetail>;
  /** Saved canvas candidates and the promoted catalog (json_render). */
  readonly gallery: UiGallery;
  /** Exact Control Plane selection from the same shared model catalog. */
  readonly controlPlane: {
    current(): Promise<RouteSelection>;
    set(selection: RouteSelection, elevate: Elevate): Promise<void>;
  };
  /** One-time sudo ticket for an exact protected call. */
  readonly authorizeTask: AuthorizeTask;
}

/**
 * Read admitted catalog choices. Browser connections may defer the provider
 * refresh until their runtime mounts, so stored choices can render first.
 */
export async function connectDoorChatAdapter(
  config: DoorConfig,
  options: { refreshOnLoad?: boolean | "background" } = {},
): Promise<DoorChatAdapter> {
  const client = new DoorClient(config);
  const providerGuide = new SelectionGuide(() => readPluginGuide(client, "model_registry"));
  const uiAuthoringGuide = new SelectionGuide(() => readUiAuthoringGuide(client));
  const pluginFeeds = new PluginFeedStore(client);
  let identity: DoorIdentity = config.identity;

  // CLI discovery opts out; the browser refreshes through its reactive runtime.
  let refreshOnMount = options.refreshOnLoad === "background";
  let catalog: Awaited<ReturnType<typeof refreshCatalog>> = options.refreshOnLoad === false || refreshOnMount
    ? { ...await listCatalog(client), refreshError: null }
    : await refreshCatalog(client);
  let providers = catalogOptions(catalog.providers, catalog.models);
  // Without stored providers there is no menu to show. Make the same single
  // startup attempt as before, and do not repeat it when the runtime mounts.
  if (refreshOnMount && providers.length === 0) {
    refreshOnMount = false;
    catalog = await refreshCatalog(client);
    providers = catalogOptions(catalog.providers, catalog.models);
  }
  let refreshing: Promise<ProviderOption[]> | undefined;
  let appliedRoute: { selection: RouteSelection; nativeProviderId: string; inferenceUrlPrefix: string; resolvedModel: string; uri: string; oauth: boolean } | null = null;
  let selectionGeneration = 0;
  let contextGeneration = 0;
  let identityGeneration = 0;
  const invalidateAppliedRoute = () => {
    appliedRoute = null;
    return ++selectionGeneration;
  };

  if (providers.length === 0) {
    throw new DoorError("NOT_FOUND", "No provider is configured.");
  }

  let committed: Awaited<ReturnType<typeof loadCommittedCatalogRoute>> = null;
  let initialRouteError: string | null = null;
  try {
    committed = await loadCommittedCatalogRoute(client, catalog.providers, catalog.models);
  } catch (error) {
    // A failed audited GetState (including a retired selected model) must not
    // hide independently admitted catalog choices. Keep the route unconfirmed
    // and the operation reference visible; do not replay the failed operation.
    const detail = error instanceof DoorError ? error.statusDetail ?? error.message : "";
    if (!(error instanceof DoorError) ||
        ["UNAUTHENTICATED", "UNAVAILABLE", "CANCELLED"].includes(error.code) ||
        !/^method_outcome_unknown; operation_id=[0-9a-f-]+(?:;|$)/i.test(detail)) throw error;
    initialRouteError = `The current model could not be confirmed. Choose and apply a model. ${detail}`;
  }
  if (committed?.bindingConfirmed) {
    const model = catalog.models.find(
      (row) => row.provider_id === committed.selection.providerId && row.model_id === committed.selection.modelId,
    );
    if (model?.inference_url_prefix) {
      try {
        const binding = await resolveCatalogModelBinding(
          client,
          committed.selection.providerId,
          committed.selection.modelId,
          model.inference_url_prefix,
        );
        appliedRoute = {
          selection: committed.selection,
          nativeProviderId: binding.reference,
          inferenceUrlPrefix: model.inference_url_prefix,
          resolvedModel: binding.model,
          uri: binding.uri,
          oauth: binding.oauth,
        };
      } catch {
        appliedRoute = null;
      }
    }
  }

  return {
    kind: "remote",
    door: client.url,
    pluginFeeds,
    committedRoute: committed?.selection ?? null,
    routeInitiallyApplied: Boolean(committed?.bindingConfirmed && appliedRoute),
    initialRouteError,
    get catalogError() { return catalog.refreshError; },
    get catalogRefreshOnMount() { return refreshOnMount; },
    binarySurface: {
      async describe() {
        return binaryMethods(await client.describeMountedZeroClaw());
      },
      async invoke(method, args, confirmSideEffects) {
        const receipt = await client.invokeMountedZeroClaw(method.path, args, confirmSideEffects);
        if (!receipt || typeof receipt !== "object" || !("result" in receipt)) {
          throw new Error("The mounted ZeroClaw call returned no result receipt.");
        }
        return receipt.result;
      },
    },
    get providers() { return providers; },
    refreshProviders: () => {
      // Consume the startup request even on failure/unknown outcome. A remount
      // must not replay a refresh; explicit refreshes still share one promise.
      refreshOnMount = false;
      providerGuide.reset();
      uiAuthoringGuide.reset();
      if (!refreshing) {
        const generation = identityGeneration;
        const assertCurrent = () => {
          if (generation !== identityGeneration) {
            throw new DoorError("CANCELLED", "Identity changed during model refresh. Refresh models again.");
          }
        };
        refreshing = refreshCatalog(client, assertCurrent).then((next) => {
          assertCurrent();
          providerGuide.reset();
          uiAuthoringGuide.reset();
          catalog = next;
          providers = catalogOptions(next.providers, next.models);
          return providers;
        }).finally(() => { refreshing = undefined; });
      }
      return refreshing;
    },
    setIdentity: (next: DoorIdentity) => {
      identityGeneration += 1;
      providerGuide.reset();
      uiAuthoringGuide.reset();
      invalidateAppliedRoute();
      contextGeneration += 1;
      identity = next;
      client.setIdentity(next);
      pluginFeeds.restart();
    },

    getChatContext: () => getChatContext(client),
    selectChatMode: (request) => {
      contextGeneration += 1;
      return selectChatMode(client, request);
    },
    listProjects: () => listProjects(client),
    listNotebooks: () => listNotebooks(client),
    selectNotebook: (notebookId) => selectNotebook(client, notebookId),
    getNotebook: (notebookId) => getNotebook(client, notebookId),
    gallery: uiGallery(client),
    controlPlane: {
      current: () => currentControlPlaneModel(client, catalog.models),
      set: async (selection, elevate) => {
        const generation = invalidateAppliedRoute();
        const context = contextGeneration;
        await providerGuide.select(selection.providerId);
        if (generation !== selectionGeneration || context !== contextGeneration) throw new Error("Model selection context changed before Apply.");
        return setControlPlaneModel(client, selection, catalog.models, elevate);
      },
    },
    authorizeTask: (plugin, method, args, password) => authorizeTask(client, plugin, method, args, password),
    followKnowledge(onKnowledge, onStatus) {
      // Assigned Oracle binding is admitted only by canonical CallMethod.
      // Never reuse its spent bootstrap assertion on the optional broker.
      if (client.isBoundOracle) {
        onStatus?.({ state: "closed", reason: "Updates unavailable", retryInMs: null });
        return () => {};
      }
      let feed: KnowledgeFeed | null = null;
      let stopped = false;
      void startKnowledgeFeed({
        client,
        identity: () => identity,
        onKnowledge,
        onStatus,
      })
        .then((started) => {
          if (stopped) started.stop();
          else feed = started;
        })
        .catch((error) => console.warn("[knowledge] feed unavailable", error));
      return () => {
        stopped = true;
        feed?.stop();
      };
    },

    async selectRoute(selection: RouteSelection): Promise<RouteSelection> {
      const generation = invalidateAppliedRoute();
      const context = contextGeneration;
      const provider = catalog.providers.find(entry => entry.provider_id === selection.providerId && entry.configured && entry.enabled);
      const model = catalog.models.find(entry => entry.provider_id === selection.providerId && entry.model_id === selection.modelId);
      if (!provider || !model || !model.available) {
        throw new Error(`The catalog model ${selection.providerId} / ${selection.modelId} is not available. Refresh models and choose an available model.`);
      }
      await providerGuide.select(selection.providerId);
      if (generation !== selectionGeneration || context !== contextGeneration) throw new Error("Model selection context changed before Apply.");
      const selected = { ...selection };
      const result = await applyCatalogModelBinding(client, selection.providerId, selection.modelId, model.inference_url_prefix);
      if (generation !== selectionGeneration || context !== contextGeneration) throw new Error("Model selection context changed before confirmation.");
      const readback = await resolveCatalogModelBinding(client, selection.providerId, selection.modelId, model.inference_url_prefix);
      if (generation !== selectionGeneration || context !== contextGeneration) throw new Error("Model selection context changed before confirmation.");
      if (!sameCatalogModelBinding(result, readback) || result.catalogRevision !== readback.catalogRevision) {
        throw new Error("Change sent; native route unconfirmed because its catalog binding changed during Apply. Refresh before retrying.");
      }
      appliedRoute = { selection: selected, nativeProviderId: result.reference, inferenceUrlPrefix: model.inference_url_prefix!, resolvedModel: result.model, uri: result.uri, oauth: result.oauth };
      return { ...selected };
    },

    async submit(request: ChatRequest): Promise<ChatResponse> {
      const reference = referenceChatResponse(request.message);
      if (reference) return reference;
      const generation = selectionGeneration;
      const context = contextGeneration;
      const identityAtStart = identityGeneration;
      const singleton = request.mode === "control_plane" || request.mode === "accountability";
      const confirmedRoute = appliedRoute && appliedRoute.selection.providerId === request.route.providerId && appliedRoute.selection.modelId === request.route.modelId ? appliedRoute : null;
      if (!singleton && !confirmedRoute) {
        responseSequence += 1;
        return {
          message: {
            id: `door-route-required-${responseSequence}`,
            role: "agent",
            content: "Apply an available catalog model with a confirmed threetched routing binding before sending a chat message.",
          },
          historyEligible: false,
        };
      }
      const messages = request.history
        .filter((message) => message.role !== "system")
        .map((message) => ({ role: roleForWire(message.role), content: message.content }));
      if (messages.length === 0 || messages[messages.length - 1].content !== request.message) {
        messages.push({ role: "user", content: request.message });
      }

      try {
        const [guide, authoringGuide] = await Promise.all([
          providerGuide.select(request.route.providerId),
          uiAuthoringGuide.select("json_render"),
        ]);
        if (identityAtStart !== identityGeneration || generation !== selectionGeneration || context !== contextGeneration) {
          throw new DoorError("CANCELLED", "Identity, chat context, or model changed while loading the sealed chat guides.");
        }
        if (request.mode === "control_plane") await verifiedControlPlaneModel(client, catalog.models);
        else if (request.mode === "accountability") await verifiedAccountabilityModel(client, catalog.models);
        else if (confirmedRoute) {
          const observed = await resolveCatalogModelBinding(
            client,
            confirmedRoute.selection.providerId,
            confirmedRoute.selection.modelId,
            confirmedRoute.inferenceUrlPrefix,
          );
          if (!sameCatalogModelBinding({
            providerId: confirmedRoute.selection.providerId,
            modelId: confirmedRoute.selection.modelId,
            reference: confirmedRoute.nativeProviderId,
            model: confirmedRoute.resolvedModel,
            uri: confirmedRoute.uri,
            oauth: confirmedRoute.oauth,
            catalogRevision: observed.catalogRevision,
          }, observed)) {
            throw new Error("The native catalog binding changed after Apply. Apply the model again before sending a message.");
          }
        }
        if (generation !== selectionGeneration || context !== contextGeneration || (!singleton && confirmedRoute !== appliedRoute)) throw new Error("Model selection context changed. Apply the model again before sending a message.");
        const chatContext = await getChatContext(client);
        if (identityAtStart !== identityGeneration || generation !== selectionGeneration || context !== contextGeneration) {
          throw new DoorError("CANCELLED", "Identity, chat context, or model changed before the chat request.");
        }
        const expectedMode = request.mode ?? "personal";
        if (expectedMode !== chatContext.mode) {
          throw new Error(`Chat mode changed from ${expectedMode} to ${chatContext.mode}. Reload the intended chat before sending again.`);
        }
        const observedMode = chatContext.mode;
        if (!/^(personal|project|control_plane|accountability|notebook_lm|ui_render)$/.test(observedMode) ||
            !Array.isArray(chatContext.effective_capabilities) || chatContext.effective_capabilities.length > 512 ||
            chatContext.effective_capabilities.some(capability => typeof capability !== "string" || !/^[A-Za-z0-9._:@/-]{1,256}$/.test(capability))) {
          throw new Error("The door returned an invalid authoritative chat context.");
        }
        const capabilities = [...new Set(chatContext.effective_capabilities)].sort();
        const contextNote = [
          `[Observed caller chat context: mode=${observedMode}; effective_capabilities=${JSON.stringify(capabilities)}]`,
          "Attached UI-authoring references are sealed read results supplied as text; they do not provide arbitrary source or filesystem access. Capability names describe door admission only; they do not provide model tools and do not prove a live operation ran.",
        ].join("\n");
        const wireMessage = [
          guide,
          authoringGuide,
          contextNote,
          catalogPresentationMessage(request.message, observedMode, request.notebook, request.catalog),
        ].join("\n\n");
        messages[messages.length - 1] = { role: "user", content: wireMessage };
        const { result, eventHash } = await client.call<ChatOutput>(
          TCHED_ROUTER,
          "Chat",
          {
            message: wireMessage,
            messages,
            ...(singleton || !confirmedRoute ? {} : {
              provider: confirmedRoute.nativeProviderId,
              model: confirmedRoute.selection.modelId,
            }),
          },
          TCHED_ROUTER_METHODS.Chat,
          { timeoutMs: CHAT_TIMEOUT_MS },
        );

        responseSequence += 1;
        const rendered = readCanvasResponse(result.content);
        return {
          ...(rendered.canvasSpec ? { canvasSpec: rendered.canvasSpec } : {}),
          ...(rendered.canvasSpecs ? { canvasSpecs: rendered.canvasSpecs } : {}),
          ...(rendered.scratch ? { scratch: true } : {}),
          ...(rendered.registered?.length ? { registered: rendered.registered } : {}),
          message: {
            id: eventHash ? `door-${eventHash}` : `door-${responseSequence}`,
            role: "agent",
            content: rendered.content,
          },
        };
      } catch (error) {
        responseSequence += 1;
        const errorMsg = error instanceof Error ? error.message : "Chat service unavailable";
        const outcomeUnknown = errorMsg.startsWith("method_outcome_unknown;");
        return {
          message: {
            id: `door-error-${responseSequence}`,
            role: "agent",
            content: `⚠️ Chat ${outcomeUnknown ? "outcome unknown" : "unavailable"}: ${errorMsg}`,
          },
          historyEligible: false,
        };
      }
    },
  };
}
