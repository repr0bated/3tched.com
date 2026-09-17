/**
 * ChatAdapter backed by the :8090 door.
 *
 * Every call is one `PluginService/CallMethod` onto the sealed `tched_router`
 * plugin. Method names, argument shapes and capability ids below are copied from
 * the live sealed schema (`zcall help tched_router <Method>`); if a reseal
 * changes them the bridge refuses the call and the refusal is surfaced verbatim.
 */
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

function toProviderOptions(providers: Provider[], routes: ModelRoute[]): ProviderOption[] {
  const byProvider = new Map<string, ModelOption[]>();
  for (const route of routes) {
    if (!route.provider || !route.model) continue;
    const models = byProvider.get(route.provider) ?? [];
    if (models.some((model) => model.id === route.model)) continue;
    models.push({ id: route.model, label: route.model, detail: modelDetail(route) });
    byProvider.set(route.provider, models);
  }
  return providers
    .filter((provider) => provider.id && byProvider.has(provider.id))
    .map((provider) => ({
      id: provider.id,
      label: provider.description ? `${provider.id} — ${provider.description}` : provider.id,
      models: byProvider.get(provider.id) ?? [],
    }));
}

let responseSequence = 0;

export interface DoorChatAdapter extends ChatAdapter {
  readonly kind: "remote";
  readonly door: string;
}

/**
 * Connect to the door, load the routable provider/model catalog, and return an
 * adapter. Throws a DoorError if the door refuses the identity or the catalog
 * has no routable model.
 */
export async function connectDoorChatAdapter(config: DoorConfig): Promise<DoorChatAdapter> {
  const client = new DoorClient(config);

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
