import { readCanvasResponse } from "../json-render/references/canvas-contract";
import { catalogPresentationMessage, referenceChatResponse } from "../json-render/references/reference-chat";
/**
 * ChatAdapter backed by the :8090 door.
 *
 * Every call is one `PluginService/CallMethod` onto the sealed `tched_router`
 * plugin. Method names, argument shapes and capability ids below are copied from
 * the live sealed schema (`zcall help tched_router <Method>`); if a reseal
 * changes them the bridge refuses the call and the refusal is surfaced verbatim.
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
  ModelOption,
  ProviderOption,
  RouteSelection,
} from "./chat-adapter";
import { DoorClient, DoorError, type DoorConfig } from "../grpc/door";
import { uiGallery, type UiGallery } from "./ui-gallery";
import {
  authorizeTask,
  currentControlPlaneModel,
  listControlPlaneModels,
  setControlPlaneModel,
  type ControlPlaneModelOption,
} from "./control-plane-model";
import type { AuthorizeTask, Elevate } from "./SudoPrompt";

export const TCHED_ROUTER = "tched_router";

/** Method → declared capability, from the sealed tched_router schema. */
export const TCHED_ROUTER_METHODS = {
  GetState: "cap.software.3tched-router.state.read@v1",
  SetSelection: "cap.software.tched-router.selection.set@v1",
  Chat: "cap.software.3tched-router.chat@v1",
} as const;

interface Provider {
  id: string;
  kind: string;
  description: string;
  aliases: string[];
}

interface ModelRoute {
  provider: string;
  model: string;
  hint: string;
  kind: string;
  available: boolean;
  status: string;
  status_reason: string;
}

interface TchedRouterState {
  status: string;
  selected_provider: string;
  selected_model: string;
  providers: Provider[];
  model_routes: ModelRoute[];
}

interface ChatOutput {
  content: string;
  provider: string;
  model: string;
  finish_reason: string;
  usage: unknown;
}

interface SetSelectionOutput {
  selected_provider: string;
  selected_model: string;
}

function roleForWire(role: ChatMessage["role"]): string {
  return role === "agent" ? "assistant" : role;
}

function modelDetail(route: ModelRoute): string {
  const parts = [route.kind, route.hint].filter(Boolean);
  if (!route.available) {
    parts.push(route.status_reason || route.status || "unavailable");
  }
  return parts.join(" · ");
}

/**
 * Group routes under their provider. Available routes sort first within a
 * provider and providers with an available route sort first overall, so the
 * picker's initial selection (first provider, first model) is one the router
 * says it can actually serve. Unavailable routes stay listed with their reason.
 */
function toProviderOptions(providers: Provider[], routes: ModelRoute[]): ProviderOption[] {
  const byProvider = new Map<string, { available: boolean; models: ModelOption[] }[]>();
  for (const route of routes) {
    if (!route.provider || !route.model) continue;
    const entries = byProvider.get(route.provider) ?? [];
    if (entries.some((entry) => entry.models[0].id === route.model)) continue;
    entries.push({
      available: route.available,
      models: [{ id: route.model, label: route.model, detail: modelDetail(route) }],
    });
    byProvider.set(route.provider, entries);
  }
  const options = providers
    .filter((provider) => provider.id && byProvider.has(provider.id))
    .map((provider) => {
      const entries = byProvider.get(provider.id) ?? [];
      const ordered = [...entries.filter((e) => e.available), ...entries.filter((e) => !e.available)];
      return {
        available: entries.some((entry) => entry.available),
        option: {
          id: provider.id,
          label: provider.description ? `${provider.id} — ${provider.description}` : provider.id,
          models: ordered.flatMap((entry) => entry.models),
        },
      };
    });
  return [...options.filter((p) => p.available), ...options.filter((p) => !p.available)].map(
    (p) => p.option,
  );
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
  /** The Control Plane model, set through the router's admitted config_set. */
  readonly controlPlane: {
    list(): Promise<ControlPlaneModelOption[]>;
    current(): Promise<string>;
    set(reference: string, elevate?: Elevate): Promise<void>;
  };
  /** One-time sudo ticket for an exact protected call. */
  readonly authorizeTask: AuthorizeTask;
}

/**
 * Connect to the door, load the routable provider/model catalog from one
 * committed state read, and return an adapter.
 */
export async function connectDoorChatAdapter(config: DoorConfig): Promise<DoorChatAdapter> {
  const client = new DoorClient(config);
  let identity: DoorIdentity = config.identity;

  const { result } = await client.call<{ state: TchedRouterState }>(
    TCHED_ROUTER,
    "GetState",
    {},
    TCHED_ROUTER_METHODS.GetState,
  );

  const providers = toProviderOptions(
    result?.state?.providers ?? [],
    result?.state?.model_routes ?? [],
  );

  if (providers.length === 0) {
    throw new DoorError("NOT_FOUND", "The router published no routable provider/model.");
  }

  return {
    kind: "remote",
    door: client.url,
    providers,
    setIdentity: (next: DoorIdentity) => {
      identity = next;
      client.setIdentity(next);
    },

    getChatContext: () => getChatContext(client),
    selectChatMode: (request) => selectChatMode(client, request),
    listProjects: () => listProjects(client),
    listNotebooks: () => listNotebooks(client),
    selectNotebook: (notebookId) => selectNotebook(client, notebookId),
    getNotebook: (notebookId) => getNotebook(client, notebookId),
    gallery: uiGallery(client),
    controlPlane: {
      list: () => listControlPlaneModels(client),
      current: () => currentControlPlaneModel(client),
      set: (reference, elevate) => setControlPlaneModel(client, reference, elevate),
    },
    authorizeTask: (plugin, method, args, password) => authorizeTask(client, plugin, method, args, password),

    followKnowledge(onKnowledge, onStatus) {
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
      const { result } = await client.call<SetSelectionOutput>(
        TCHED_ROUTER,
        "SetSelection",
        { provider_id: selection.providerId, model_id: selection.modelId },
        TCHED_ROUTER_METHODS.SetSelection,
      );
      return {
        providerId: result.selected_provider || selection.providerId,
        modelId: result.selected_model || selection.modelId,
      };
    },

    async submit(request: ChatRequest): Promise<ChatResponse> {
      const reference = referenceChatResponse(request.message);
      if (reference) return reference;
      const wireMessage = catalogPresentationMessage(request.message, request.mode, request.notebook, request.catalog);
      const messages = request.history
        .filter((message) => message.role !== "system")
        .map((message) => ({ role: roleForWire(message.role), content: message.content }));
      if (messages.length === 0 || messages[messages.length - 1].content !== request.message) {
        messages.push({ role: "user", content: request.message });
      }

      messages[messages.length - 1] = { role: "user", content: wireMessage };

      try {
        const { result, eventHash } = await client.call<ChatOutput>(
          TCHED_ROUTER,
          "Chat",
          {
            message: wireMessage,
            messages,
            ...(request.mode === "control_plane" ? {} : {
              provider: request.route.providerId,
              model: request.route.modelId,
            }),
          },
          TCHED_ROUTER_METHODS.Chat,
          { timeoutMs: CHAT_TIMEOUT_MS },
        );

        responseSequence += 1;
        const rendered = readCanvasResponse(result.content);
        return {
          ...(rendered.canvasSpec ? { canvasSpec: rendered.canvasSpec } : {}),
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
            content: `⚠️ Chat unavailable: ${errorMsg}. Try semantic search on vectorized repos instead, or configure an LLM provider in control plane.`,
          },
        };
      }
    },
  };
}
