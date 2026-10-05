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
import { listCatalog, type CatalogModel, type CatalogProvider } from "./model-catalog";
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

export const TCHED_ROUTER = "tched_router";

/** Method → declared capability, from the sealed tched_router schema. */
export const TCHED_ROUTER_METHODS = {
  GetState: "cap.software.3tched-router.state.read@v1",
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
 * Connect to the door, load providers and the models stored for each
 * provider, and return an adapter.
 */
export async function connectDoorChatAdapter(config: DoorConfig): Promise<DoorChatAdapter> {
  const client = new DoorClient(config);
  const pluginFeeds = new PluginFeedStore(client);
  let identity: DoorIdentity = config.identity;

  let catalog = await listCatalog(client);
  let providers = catalogOptions(catalog.providers, catalog.models);
  let refreshing: Promise<ProviderOption[]> | undefined;
  let appliedRoute: { selection: RouteSelection; nativeProviderId: string; inferenceUrlPrefix: string; resolvedModel: string; uri: string } | null = null;
  let selectionGeneration = 0;
  let contextGeneration = 0;
  const invalidateAppliedRoute = () => {
    appliedRoute = null;
    return ++selectionGeneration;
  };

  if (providers.length === 0) {
    throw new DoorError("NOT_FOUND", "No provider is configured.");
  }

  const committed = await loadCommittedCatalogRoute(client, catalog.providers, catalog.models);
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
    get providers() { return providers; },
    refreshProviders: () => {
      if (!refreshing) {
        refreshing = listCatalog(client).then((next) => {
          catalog = next;
          providers = catalogOptions(next.providers, next.models);
          return providers;
        }).finally(() => { refreshing = undefined; });
      }
      return refreshing;
    },
    setIdentity: (next: DoorIdentity) => {
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
      set: (selection, elevate) => {
        invalidateAppliedRoute();
        return setControlPlaneModel(client, selection, catalog.models, elevate);
      },
    },
    authorizeTask: (plugin, method, args, password) => authorizeTask(client, plugin, method, args, password),
    async recoverConversation() {
      const context = contextGeneration;
      // The sealed read recovers only this credential's private projection.
      // Its episode content is deliberately neither retained nor presented.
      await client.call("ctl_plane_chatbot", "list_episodes", { limit: 1 }, "chatbot.read");
      if (context !== contextGeneration) throw new Error("Conversation context changed during recovery. Recover the current conversation again.");
    },

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
      const binding = await resolveCatalogModelBinding(client, selection.providerId, selection.modelId, model.inference_url_prefix);
      if (generation !== selectionGeneration || context !== contextGeneration) throw new Error("Model selection context changed before Apply.");
      const selected = { ...selection };
      const result = await applyCatalogModelBinding(client, selection.providerId, selection.modelId, model.inference_url_prefix, binding);
      if (generation !== selectionGeneration || context !== contextGeneration) throw new Error("Model selection context changed before confirmation.");
      const readback = await resolveCatalogModelBinding(client, selection.providerId, selection.modelId, model.inference_url_prefix);
      if (generation !== selectionGeneration || context !== contextGeneration) throw new Error("Model selection context changed before confirmation.");
      if (!sameCatalogModelBinding(binding, readback)) {
        throw new Error("Change sent; native route unconfirmed because its catalog binding changed during Apply. Refresh before retrying.");
      }
      appliedRoute = { selection: selected, nativeProviderId: result.reference, inferenceUrlPrefix: model.inference_url_prefix!, resolvedModel: result.model, uri: result.uri };
      return { ...selected };
    },

    async submit(request: ChatRequest): Promise<ChatResponse> {
      const reference = referenceChatResponse(request.message);
      if (reference) return reference;
      const generation = selectionGeneration;
      const context = contextGeneration;
      const singleton = request.mode === "control_plane" || request.mode === "accountability";
      const confirmedRoute = appliedRoute && appliedRoute.selection.providerId === request.route.providerId && appliedRoute.selection.modelId === request.route.modelId ? appliedRoute : null;
      if (!singleton && !confirmedRoute) {
        responseSequence += 1;
        return {
          message: {
            id: `door-route-required-${responseSequence}`,
            role: "agent",
            content: "Apply an available catalog model with a confirmed native routing binding before sending a chat message.",
          },
        };
      }
      const wireMessage = catalogPresentationMessage(request.message, request.mode, request.notebook, request.catalog);
      const messages = request.history
        .filter((message) => message.role !== "system")
        .map((message) => ({ role: roleForWire(message.role), content: message.content }));
      if (messages.length === 0 || messages[messages.length - 1].content !== request.message) {
        messages.push({ role: "user", content: request.message });
      }

      messages[messages.length - 1] = { role: "user", content: wireMessage };

      try {
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
            catalogRevision: observed.catalogRevision,
          }, observed)) {
            throw new Error("The native catalog binding changed after Apply. Apply the model again before sending a message.");
          }
        }
        if (generation !== selectionGeneration || context !== contextGeneration || (!singleton && confirmedRoute !== appliedRoute)) throw new Error("Model selection context changed. Apply the model again before sending a message.");
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
          ...(rendered.scratch ? { scratch: true } : {}),
          message: {
            id: eventHash ? `door-${eventHash}` : `door-${responseSequence}`,
            role: "agent",
            content: rendered.content,
          },
        };
      } catch (error) {
        responseSequence += 1;
        const errorMsg = error instanceof Error ? error.message : "Chat service unavailable";
        return {
          message: {
            id: `door-error-${responseSequence}`,
            role: "agent",
            content: `⚠️ Chat unavailable: ${errorMsg}`,
          },
        };
      }
    },
  };
}
