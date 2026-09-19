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

export const TCHED_ROUTER = "tched_router";

/** Method → declared capability, from the sealed tched_router schema. */
export const TCHED_ROUTER_METHODS = {
  ListProviders: "cap.software.3tched-router.providers.read@v1",
  ListModels: "cap.software.3tched-router.models.read@v1",
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
}

/**
 * Connect to the door, load the routable provider/model catalog, and return an
 * adapter. Throws a DoorError if the door refuses the identity or the catalog
 * has no routable model.
 */
export async function connectDoorChatAdapter(config: DoorConfig): Promise<DoorChatAdapter> {
  const client = new DoorClient(config);
  let identity: DoorIdentity = config.identity;

  const [providersOut, modelsOut] = await Promise.all([
    client.call<{ providers: Provider[] }>(
      TCHED_ROUTER,
      "ListProviders",
      {},
      TCHED_ROUTER_METHODS.ListProviders,
    ),
    client.call<{ model_routes: ModelRoute[] }>(
      TCHED_ROUTER,
      "ListModels",
      { provider: "" },
      TCHED_ROUTER_METHODS.ListModels,
    ),
  ]);

  const providers = toProviderOptions(
    providersOut.result?.providers ?? [],
    modelsOut.result?.model_routes ?? [],
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
      const messages = request.history
        .filter((message) => message.role !== "system")
        .map((message) => ({ role: roleForWire(message.role), content: message.content }));
      if (messages.length === 0 || messages[messages.length - 1].content !== request.message) {
        messages.push({ role: "user", content: request.message });
      }

      const { result, eventHash } = await client.call<ChatOutput>(
        TCHED_ROUTER,
        "Chat",
        {
          message: request.message,
          messages,
          provider: request.route.providerId,
          model: request.route.modelId,
        },
        TCHED_ROUTER_METHODS.Chat,
        { timeoutMs: CHAT_TIMEOUT_MS },
      );

      responseSequence += 1;
      return {
        message: {
          id: eventHash ? `door-${eventHash}` : `door-${responseSequence}`,
          role: "agent",
          content: result.content,
        },
      };
    },
  };
}
