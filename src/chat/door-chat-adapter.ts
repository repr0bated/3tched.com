import { readPluginGuide, readUiAuthoringGuide, SelectionGuide } from "./plugin-guide";
import { readMountedCatalog } from "./mounted-catalog";
import { referenceChatResponse } from "../json-render/references/reference-chat";
/**
 * ChatAdapter backed by the :8090 door.
 *
 * Every call is one `PluginService/CallMethod`. The provider menu reads the
 * sealed `model_registry`; ordinary selection still uses catalog binding reads.
 * Chat replies come only from committed `chat_response` turns — never from
 * retired `tched_router.Chat` or `json_render.generate_spec`.
 * Method names, argument shapes and capability ids are copied from the live
 * sealed schema (`zcall help`); if a reseal changes them the bridge refuses
 * the call and the refusal is surfaced verbatim.
 */
import { startKnowledgeFeed, type KnowledgeFeed, type KnowledgePush } from "./knowledge-feed";
import { doorbellPassword, type DoorbellStatus } from "./doorbell";
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
  controlPlaneModelAccess,
  currentControlPlaneModel,
  setControlPlaneModel,
  type ControlPlaneModelAccess,
} from "./control-plane-model";
import { applyCatalogModelBinding, resolveCatalogModelBinding, sameCatalogModelBinding } from "./native-routing";
import { loadCommittedCatalogRoute } from "./router-committed-route";
import {
  CHAT_RESPONSE_CAPS,
  CHAT_RESPONSE_METHODS,
  COMMITTED_REPLY_TIMEOUT_MS,
  submitAndAwaitCommittedReply,
} from "./chat-response-client";
import type { AuthorizeTask, Elevate } from "./elevation";
import { binaryMethods, type BinaryMethod } from "./threetchedfs-surface";

export const TCHED_ROUTER = "chat_router";

/** Method → declared capability, from the sealed catalog-binding schema. */
export const TCHED_ROUTER_METHODS = {
  SetSelection: "cap.software.tched-router.selection.set@v1",
  ResolveCatalogModelBinding: "cap.software.tched-router.model.binding.read@v1",
  ApplyCatalogModelBinding: "cap.software.tched-router.catalog.selection.set@v1",
} as const;

export { CHAT_RESPONSE_CAPS, CHAT_RESPONSE_METHODS };

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

let responseSequence = 0;

export interface DoorChatAdapter extends ChatAdapter {
  readonly kind: "remote";
  readonly door: string;
  readonly committedRoute: RouteSelection | null;
  readonly routeInitiallyApplied: boolean;
  /** The verified caller's mounted threetched filesystem. */
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
    access(): Promise<ControlPlaneModelAccess>;
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
  const activeChatWaits = new Set<AbortController>();
  const knowledgeStops = new Set<() => void>();
  const cancelChatWaits = () => {
    for (const controller of activeChatWaits) controller.abort();
  };
  const doorbellCredential = async () => {
    if (config.boundOracle) {
      const fresh = await config.boundOracle.nextIdentity();
      if (fresh.kind !== "oia1") throw new DoorError("UNAUTHENTICATED", "Bound identity requires a fresh Oracle assertion.");
      return doorbellPassword(fresh);
    }
    return doorbellPassword(identity);
  };
  const cancelSession = () => {
    cancelChatWaits();
    for (const stop of knowledgeStops) stop();
  };
  config.signal?.addEventListener("abort", cancelSession, { once: true });
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
  /** Bridge-minted chat_response conversation; reused until identity/context changes. */
  let conversationId: string | null = null;
  const invalidateAppliedRoute = () => {
    appliedRoute = null;
    return ++selectionGeneration;
  };
  const invalidateConversation = () => {
    cancelChatWaits();
    conversationId = null;
    contextGeneration += 1;
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

  const binaryPins = new WeakMap<BinaryMethod, string>();
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
        const catalog = await readMountedCatalog(client, "threetched");
        const plugin = catalog.views.flatMap(view => view.plugins).find(entry => entry.plugin_id === "threetched");
        if (!plugin || !plugin.schema.methods || typeof plugin.schema.methods !== "object" || Array.isArray(plugin.schema.methods))
          throw new Error("The caller's mounted threetched schema is unavailable.");
        const methods = binaryMethods({ methods: plugin.operations.map(operation => ({
          plugin_id: plugin.plugin_id, method: operation.method, path: operation.call_path,
          declaration: (plugin.schema.methods as Record<string, unknown>)[operation.method],
        })) });
        for (const method of methods) binaryPins.set(method, plugin.schema_hash);
        return methods;
      },
      async invoke(method, args, confirmSideEffects) {
        const schemaHash = binaryPins.get(method);
        if (!schemaHash) throw new Error("Discover the current mounted method before invoking it.");
        if (method.declaration.side_effect !== "read" && !confirmSideEffects)
          throw new Error("Confirm this binary command before calling it.");
        return (await client.call("threetched", method.method, args, method.declaration.required_capability,
          { expectedSchemaHash: schemaHash })).result;
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
      if (client.isBoundOracle) throw new DoorError("UNAUTHENTICATED", "Reconnect to change a bound identity.");
      identityGeneration += 1;
      providerGuide.reset();
      uiAuthoringGuide.reset();
      client.setIdentity(next);
      invalidateAppliedRoute();
      invalidateConversation();
      for (const stop of knowledgeStops) stop();
      knowledgeStops.clear();
      identity = next;
      pluginFeeds.restart();
    },

    async invokeApplicationAction(plugin, method, capability, args, schemaHash) {
      return (await client.call(plugin, method, args, capability, { expectedSchemaHash: schemaHash })).result;
    },
    getChatContext: () => getChatContext(client),
    selectChatMode: (request) => {
      invalidateConversation();
      return selectChatMode(client, request);
    },
    listProjects: () => listProjects(client),
    listNotebooks: () => listNotebooks(client),
    selectNotebook: (notebookId) => selectNotebook(client, notebookId),
    getNotebook: (notebookId) => getNotebook(client, notebookId),
    gallery: uiGallery(client),
    controlPlane: {
      access: () => controlPlaneModelAccess(client),
      current: async () => currentControlPlaneModel(client, catalog.models, await controlPlaneModelAccess(client) === "self" || client.isBoundOracle),
      set: (selection, elevate) => {
        invalidateAppliedRoute();
        return setControlPlaneModel(client, selection, catalog.models, elevate);
      },
    },
    authorizeTask: (plugin, method, args, password) => authorizeTask(client, plugin, method, args, password),
    followKnowledge(onKnowledge, onStatus) {
      if (config.signal?.aborted) {
        onStatus?.({ state: "closed", reason: "Connection cancelled", retryInMs: null });
        return () => {};
      }
      let feed: KnowledgeFeed | null = null;
      let stopped = false;
      const feedController = new AbortController();
      const stop = () => {
        if (stopped) return;
        stopped = true;
        feedController.abort();
        feed?.stop();
        knowledgeStops.delete(stop);
      };
      knowledgeStops.add(stop);
      void startKnowledgeFeed({
        client,
        signal: feedController.signal,
        credential: doorbellCredential,
        onKnowledge,
        onStatus,
        ...(!config.boundOracle ? { identity: () => identity } : {}),
      })
        .then((started) => {
          if (stopped) started.stop();
          else feed = started;
        })
        .catch((error) => {
          if (stopped) return;
          console.warn("[knowledge] feed unavailable", error);
          stop();
        });
      return stop;
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
      const uiRender = request.mode === "ui_render";

      const waitController = new AbortController();
      activeChatWaits.add(waitController);
      if (config.signal?.aborted) waitController.abort();
      try {
        // Authoritative selection and history live server-side; the UI sends
        // one new human message and displays only the committed reply. A
        // browser model-picker draft is not a prerequisite for a chat turn.
        const { conversationId: active, response } = await submitAndAwaitCommittedReply(
          client,
          conversationId,
          request.message,
          uiRender ? "application" : "text",
          COMMITTED_REPLY_TIMEOUT_MS,
          { signal: waitController.signal, credential: doorbellCredential },
        );
        if (generation !== selectionGeneration || context !== contextGeneration) {
          throw new Error("Chat context changed while awaiting a committed reply; outcome may have completed. Do not retry automatically.");
        }
        conversationId = active;
        return response;
      } catch (error) {
        responseSequence += 1;
        const errorMsg = error instanceof Error ? error.message : "Chat service unavailable";
        const outcomeUnknown = errorMsg.startsWith("method_outcome_unknown;") || /outcome (?:is unknown|may have completed)/i.test(errorMsg);
        return {
          message: {
            id: `door-error-${responseSequence}`,
            role: "agent",
            content: `⚠️ Chat ${outcomeUnknown ? "outcome unknown" : "unavailable"}: ${errorMsg}`,
          },
          historyEligible: false,
        };
      } finally {
        activeChatWaits.delete(waitController);
      }
    },
  };
}
