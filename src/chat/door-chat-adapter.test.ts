import { afterEach, describe, expect, it, vi } from "vitest";
import type { RpcOptions } from "@protobuf-ts/runtime-rpc";
import { Value } from "../grpc/gen/google/protobuf/struct";
import { ErrorCode, type CallMethodRequest, type CallMethodResponse } from "../grpc/gen/operation";
import { PluginServiceClient } from "../grpc/gen/operation.client";
import { DoorError, OIA1_HEADER, PLUGIN_INTERFACE, PLUGIN_OBJECT_ROOT } from "../grpc/door";
import { TCHED_ROUTER_METHODS, connectDoorChatAdapter } from "./door-chat-adapter";

type Recorded = { request: CallMethodRequest; meta: NonNullable<RpcOptions["meta"]> };

function envelope(method: string, result: unknown): CallMethodResponse {
  return {
    success: true,
    result: Value.fromJson({
      success: true,
      event_id: 7,
      event_hash: `hash-${method}`,
      plugin_id: "tched_router",
      method,
      result: result as never,
    }),
    eventId: "7",
    eventHash: `hash-${method}`,
  };
}

function mockDoor(handlers: Record<string, (args: unknown) => CallMethodResponse>) {
  const calls: Recorded[] = [];
  vi.spyOn(PluginServiceClient.prototype, "callMethod").mockImplementation(
    (request: CallMethodRequest, options?: RpcOptions) => {
      calls.push({ request, meta: options?.meta ?? {} });
      const handler = handlers[request.methodName];
      if (!handler) throw new Error(`unexpected method ${request.methodName}`);
      const args = request.arguments[0] ? Value.toJson(request.arguments[0]) : {};
      const response = handler(args);
      return Promise.resolve({ response }) as never;
    },
  );
  return calls;
}

const config = {
  url: "https://10.0.0.3:8090",
  identity: { kind: "oia1" as const, assertion: "QUJDRA==" },
};

afterEach(() => vi.restoreAllMocks());

describe("connectDoorChatAdapter", () => {
  it("loads providers and models with the declared capabilities and identity", async () => {
    const calls = mockDoor({
      ListProviders: () =>
        envelope("ListProviders", {
          providers: [
            { id: "anthropic", kind: "provider", description: "Anthropic", aliases: [] },
            { id: "orphan", kind: "provider", description: "", aliases: [] },
          ],
        }),
      ListModels: () =>
        envelope("ListModels", {
          model_routes: [
            { provider: "anthropic", model: "claude-opus-5", hint: "reasoning", kind: "chat", available: true, status: "ok", status_reason: "" },
            { provider: "anthropic", model: "claude-opus-5", hint: "code", kind: "chat", available: true, status: "ok", status_reason: "" },
          ],
        }),
    });

    const adapter = await connectDoorChatAdapter(config);

    expect(adapter.kind).toBe("remote");
    expect(adapter.door).toBe("https://10.0.0.3:8090");
    expect(adapter.providers).toEqual([
      {
        id: "anthropic",
        label: "anthropic — Anthropic",
        models: [{ id: "claude-opus-5", label: "claude-opus-5", detail: "chat · reasoning" }],
      },
    ]);

    const byMethod = Object.fromEntries(calls.map((call) => [call.request.methodName, call]));
    expect(byMethod.ListProviders.request).toMatchObject({
      pluginId: "tched_router",
      objectPath: `${PLUGIN_OBJECT_ROOT}/tched_router`,
      interfaceName: PLUGIN_INTERFACE,
      capabilityId: TCHED_ROUTER_METHODS.ListProviders,
    });
    expect(byMethod.ListModels.request.capabilityId).toBe(TCHED_ROUTER_METHODS.ListModels);
    expect(byMethod.ListProviders.meta).toEqual({ [OIA1_HEADER]: "QUJDRA==" });
  });

  it("commits the route with SetSelection and sends the conversation to Chat", async () => {
    const calls = mockDoor({
      ListProviders: () =>
        envelope("ListProviders", { providers: [{ id: "local", kind: "local", description: "", aliases: [] }] }),
      ListModels: () =>
        envelope("ListModels", {
          model_routes: [{ provider: "local", model: "gemma", hint: "local", kind: "chat", available: true, status: "", status_reason: "" }],
        }),
      SetSelection: (args) =>
        envelope("SetSelection", {
          selected_provider: (args as { provider_id: string }).provider_id,
          selected_model: (args as { model_id: string }).model_id,
        }),
      Chat: () =>
        envelope("Chat", { content: "hello from the router", provider: "local", model: "gemma", finish_reason: "stop", usage: {} }),
    });

    const adapter = await connectDoorChatAdapter(config);
    const route = await adapter.selectRoute({ providerId: "local", modelId: "gemma" });
    expect(route).toEqual({ providerId: "local", modelId: "gemma" });

    const response = await adapter.submit({
      message: "hi",
      history: [
        { id: "a1", role: "agent", content: "earlier reply" },
        { id: "u1", role: "user", content: "hi" },
      ],
      route,
    });

    expect(response.message).toEqual({ id: "door-hash-Chat", role: "agent", content: "hello from the router" });
    expect(response.canvasSpec).toBeUndefined();

    const chat = calls.find((call) => call.request.methodName === "Chat")!;
    expect(chat.request.capabilityId).toBe(TCHED_ROUTER_METHODS.Chat);
    expect(Value.toJson(chat.request.arguments[0])).toEqual({
      message: "hi",
      messages: [
        { role: "assistant", content: "earlier reply" },
        { role: "user", content: "hi" },
      ],
      provider: "local",
      model: "gemma",
    });
  });

  it("surfaces a bridge refusal as a DoorError, never as empty data", async () => {
    mockDoor({
      ListProviders: () => ({
        success: false,
        result: undefined,
        eventId: "0",
        eventHash: "",
        error: { code: ErrorCode.PERMISSION_DENIED, message: "capability not held" },
      }),
      ListModels: () => envelope("ListModels", { model_routes: [] }),
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(connectDoorChatAdapter(config)).rejects.toMatchObject({
      name: "DoorError",
      code: "PERMISSION_DENIED",
    });
  });

  it("refuses a malformed credential before contacting the door", async () => {
    const calls = mockDoor({});
    await expect(
      connectDoorChatAdapter({ url: config.url, identity: { kind: "sid1", sealedId: "not base64!" } }),
    ).rejects.toBeInstanceOf(DoorError);
    expect(calls).toHaveLength(0);
  });
});
