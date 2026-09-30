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

function catalog(providers: unknown[] = [], models: unknown[] = [], more = false) {
  return {
    list_providers: () => envelope("list_providers", { providers, revision: 1 }),
    list_models: (args: unknown) => {
      const query = args as { after?: unknown; provider_id?: string };
      if (query.after) return envelope("list_models", { models: [], more: false, revision: 1 });
      const page = query.provider_id
        ? models.filter((model) => (model as { provider_id?: string }).provider_id === query.provider_id)
        : models;
      return envelope("list_models", { models: page, more, revision: 1 });
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe("connectDoorChatAdapter", () => {
  it("loads the shared provider catalog and leaves the router families behind once models exist", async () => {
    const calls = mockDoor({
      ...catalog(
        [
          { provider_id: "openrouter", name: "OpenRouter", configured: true, enabled: true, status: "ok", control_plane_profiles: ["openrouter.control_plane"] },
          { provider_id: "openai", name: "OpenAI", configured: true, enabled: true, status: "ok", control_plane_profiles: ["openai.control_plane"] },
          { provider_id: "disabled", name: "Off", configured: true, enabled: false, status: "ok", control_plane_profiles: [] },
        ],
        [
          { provider_id: "openrouter", model_id: "anthropic/claude", name: "Claude", available: true, context_length: 200000 },
          { provider_id: "openai", model_id: "gpt-5", name: "", available: true },
        ],
      ),
      GetState: () =>
        envelope("GetState", {
          state: {
            status: "active",
            selected_provider: "opencode",
            selected_model: "glm",
            providers: [
              { id: "opencode", kind: "provider", description: "OpenCode", aliases: [] },
              { id: "custom", kind: "provider", description: "Custom", aliases: [] },
            ],
            model_routes: [
              { provider: "opencode", model: "glm", hint: "runtime", kind: "chat", available: true, status: "ok", status_reason: "" },
              { provider: "custom", model: "loopback", hint: "runtime", kind: "chat", available: true, status: "ok", status_reason: "" },
            ],
          },
        }),
    });

    const adapter = await connectDoorChatAdapter(config);

    expect(adapter.kind).toBe("remote");
    expect(adapter.door).toBe("https://10.0.0.3:8090");
    expect(adapter.providers).toEqual([
      {
        id: "openrouter",
        label: "OpenRouter",
        models: [{ id: "anthropic/claude", label: "Claude", detail: "200000 ctx" }],
      },
      {
        id: "openai",
        label: "OpenAI",
        models: [{ id: "gpt-5", label: "gpt-5", detail: "" }],
      },
    ]);

    const byMethod = Object.fromEntries(calls.map((call) => [call.request.methodName, call]));
    expect(byMethod.list_providers.request).toMatchObject({
      pluginId: "model_registry",
      objectPath: `${PLUGIN_OBJECT_ROOT}/model_registry`,
      interfaceName: PLUGIN_INTERFACE,
      capabilityId: "model_registry.read",
    });
    expect(byMethod.list_providers.meta).toEqual({
      [OIA1_HEADER]: "QUJDRA==",
      "x-opdbus-capability": "model_registry.read",
    });
    const modelLookups = calls.filter((call) => call.request.methodName === "list_models");
    expect(modelLookups.map((call) => Value.toJson(call.request.arguments[0]))).toEqual([
      { provider_id: "openrouter", limit: 500 },
      { provider_id: "openai", limit: 500 },
    ]);
  });

  it("lists only the catalog keyed by provider and does not invent router models", async () => {
    const calls = mockDoor({
      ...catalog([
        { provider_id: "openrouter", name: "OpenRouter", configured: true, enabled: true, status: "never", control_plane_profiles: [] },
        { provider_id: "xai", name: "SpaceXAI", configured: true, enabled: true, status: "never", control_plane_profiles: [] },
      ]),
      GetState: () => envelope("GetState", { state: {
        status: "active", selected_provider: "opencode", selected_model: "glm",
        providers: [
          { id: "opencode", kind: "provider", description: "OpenCode family", aliases: [] },
          { id: "custom", kind: "provider", description: "", aliases: [] },
        ],
        model_routes: [
          { provider: "opencode", model: "glm", hint: "runtime", kind: "chat", available: true, status: "ok", status_reason: "" },
          { provider: "custom", model: "loopback", hint: "", kind: "chat", available: true, status: "", status_reason: "" },
        ],
      } }),
    });
    const adapter = await connectDoorChatAdapter(config);
    expect(adapter.providers).toEqual([
      { id: "openrouter", label: "OpenRouter", models: [] },
      { id: "xai", label: "SpaceXAI", models: [] },
    ]);
    expect(calls.some((call) => call.request.methodName === "GetState")).toBe(false);
    expect(calls.filter((call) => call.request.methodName === "list_models")).toHaveLength(2);
  });

  it("reports an empty catalog without inventing available models", async () => {
    mockDoor({
      ...catalog(),
      GetState: () => envelope("GetState", { state: {
        status: "active", selected_provider: "", selected_model: "",
        providers: [], model_routes: [],
      } }),
    });

    await expect(connectDoorChatAdapter(config)).rejects.toMatchObject({
      name: "DoorError",
      code: "NOT_FOUND",
      message: "No provider is configured.",
    });
  });

  it("commits the route with SetSelection and sends the conversation to Chat", async () => {
    const calls = mockDoor({
      ...catalog([
        { provider_id: "openrouter", name: "OpenRouter", configured: true, enabled: true, status: "ok", control_plane_profiles: [] },
      ]),
      GetState: () =>
        envelope("GetState", { state: {
          status: "active", selected_provider: "local", selected_model: "gemma",
          providers: [{ id: "local", kind: "local", description: "", aliases: [] }],
          model_routes: [{ provider: "local", model: "gemma", hint: "local", kind: "chat", available: true, status: "", status_reason: "" }],
        } }),
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
    const args = Value.toJson(chat.request.arguments[0]) as { message: string; messages: { role: string; content: string }[]; provider: string; model: string };
    expect(args.message).toContain("Answer the user's request normally");
    expect(args.message).toContain("dashboardTable");
    expect(args.message).toContain("User request:\nhi");
    expect(args.messages).toEqual([
      { role: "assistant", content: "earlier reply" },
      { role: "user", content: args.message },
    ]);
    expect({ provider: args.provider, model: args.model }).toEqual({ provider: "local", model: "gemma" });
  });

  it("does not send the personal provider or model in Control Plane mode", async () => {
    const calls = mockDoor({
      ...catalog([
        { provider_id: "openrouter", name: "OpenRouter", configured: true, enabled: true, status: "ok", control_plane_profiles: [] },
      ]),
      GetState: () => envelope("GetState", { state: { status: "active", selected_provider: "local", selected_model: "gemma", providers: [{ id: "local", kind: "local", description: "", aliases: [] }], model_routes: [{ provider: "local", model: "gemma", hint: "", kind: "chat", available: true, status: "", status_reason: "" }] } }),
      Chat: () => envelope("Chat", { content: "control plane reply", provider: "", model: "", finish_reason: "stop", usage: {} }),
    });
    const adapter = await connectDoorChatAdapter(config);
    await adapter.submit({ message: "status", history: [], route: { providerId: "local", modelId: "gemma" }, mode: "control_plane" });
    const chat = calls.find((call) => call.request.methodName === "Chat")!;
    const args = Value.toJson(chat.request.arguments[0]) as { message: string; messages: { role: string; content: string }[]; provider?: string; model?: string };
    expect(args.message).toContain("Answer the user's request normally");
    expect(args.message).toContain("dashboardTable");
    expect(args.messages).toEqual([{ role: "user", content: args.message }]);
    expect(args.provider).toBeUndefined();
    expect(args.model).toBeUndefined();
    expect(calls.some((call) => call.request.methodName === "SetSelection")).toBe(false);
  });

  it("surfaces a bridge refusal as a DoorError, never as empty data", async () => {
    mockDoor({
      list_providers: () => ({
        success: false,
        result: undefined,
        eventId: "0",
        eventHash: "",
        error: { code: ErrorCode.PERMISSION_DENIED, message: "capability not held" },
      }),
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

describe("UI reference and rendering transport", () => {
  it.each(["personal", "control_plane", "accountability"] as const)("offers validated catalog presentation in %s mode", async (mode) => {
    const spec = { root: "status", elements: { status: { type: "dashboardStatus", props: { label: "Example only", tone: "info" } } } };
    const calls = mockDoor({
      ...catalog([
        { provider_id: "openrouter", name: "OpenRouter", configured: true, enabled: true, status: "ok", control_plane_profiles: [] },
      ]),
      GetState: () => envelope("GetState", { state: { status: "active", selected_provider: "local", selected_model: "demo", providers: [{ id: "local", kind: "local", description: "", aliases: [] }], model_routes: [{ provider: "local", model: "demo", hint: "", kind: "chat", available: true, status: "", status_reason: "" }] } }),
      Chat: () => envelope("Chat", { content: `Status\n\`\`\`json-render\n${JSON.stringify(spec)}\n\`\`\``, provider: "local", model: "demo" }),
    });
    const adapter = await connectDoorChatAdapter(config);
    const response = await adapter.submit({ message: "show status", history: [], route: { providerId: "local", modelId: "demo" }, mode });
    expect(response.canvasSpec).toEqual(spec);
    expect(response.message.content).toBe("Status");
    const chat = calls.find(call => call.request.methodName === "Chat")!;
    const args = Value.toJson(chat.request.arguments[0]) as { message: string; messages: { content: string }[]; provider?: string; model?: string };
    expect(args.message).toContain("optionally include exactly one fenced json-render block");
    expect(args.message).toContain("dashboardStatus");
    expect(args.messages.at(-1)?.content).toBe(args.message);
    if (mode === "control_plane") {
      expect(args.provider).toBeUndefined();
      expect(args.model).toBeUndefined();
    } else {
      expect(args.provider).toBe("local");
      expect(args.model).toBe("demo");
    }
  });

  it("supplies the implemented catalog in UI render mode and validates the returned canvas", async () => {
    const spec = { root: "status", elements: { status: { type: "dashboardStatus", props: { label: "Example only", tone: "info" } } } };
    const calls = mockDoor({
      ...catalog([
        { provider_id: "openrouter", name: "OpenRouter", configured: true, enabled: true, status: "ok", control_plane_profiles: [] },
      ]),
      GetState: () => envelope("GetState", { state: { status: "active", selected_provider: "local", selected_model: "demo", providers: [{ id: "local", kind: "local", description: "", aliases: [] }], model_routes: [{ provider: "local", model: "demo", hint: "", kind: "chat", available: true, status: "", status_reason: "" }] } }),
      Chat: () => envelope("Chat", { content: `Preview\n\`\`\`json-render\n${JSON.stringify(spec)}\n\`\`\``, provider: "local", model: "demo" }),
    });
    const adapter = await connectDoorChatAdapter(config);
    const response = await adapter.submit({ message: "show btrfs", history: [], route: { providerId: "local", modelId: "demo" }, mode: "ui_render" });
    expect(response.canvasSpec).toEqual(spec);
    expect(response.message.content).toBe("Preview");
    const call = calls.find(call => call.request.methodName === "Chat")!;
    const args = Value.toJson(call.request.arguments[0]) as { message: string; messages: { content: string }[] };
    expect(args.message).toContain("Relevant static reference (btrfs)");
    expect(args.message).toContain("gallery for proposing possible interfaces");
    expect(args.message).toContain("Do not claim any proposal has been promoted into the main catalog");
    expect(args.message).toContain("dashboardTable");
    expect(args.messages.at(-1)?.content).toBe(args.message);
    const before = calls.length;
    const reference = await adapter.submit({ message: "/ui-reference btrfs", history: [], route: { providerId: "local", modelId: "demo" } });
    expect(reference.canvasSpec).toBeDefined();
    expect(calls).toHaveLength(before);
  });
});

it("reloads Cozo choices without mutating routing and preserves them when a reload fails", async () => {
  let current = "old";
  let fail = false;
  const calls = mockDoor({
    list_providers: () => {
      if (fail) throw new Error("catalog unavailable");
      return envelope("list_providers", { providers: [{ provider_id: "vendor", configured: true, enabled: true, status: "ok", control_plane_profiles: ["custom.control_plane"] }], revision: 1 });
    },
    list_models: () => envelope("list_models", { models: [{ provider_id: "vendor", model_id: current, available: true }], more: false, revision: 1 }),
  });
  const adapter = await connectDoorChatAdapter(config);
  expect(adapter.providers[0].models[0].id).toBe("old");
  current = "new";
  const one = adapter.refreshProviders!();
  const two = adapter.refreshProviders!();
  expect(one).toBe(two);
  await one;
  expect(adapter.providers[0].models[0].id).toBe("new");
  expect(adapter.providers[0].models.some(m => m.id === "custom.control_plane")).toBe(false);
  fail = true;
  await expect(adapter.refreshProviders!()).rejects.toThrow("The door is not reachable right now.");
  expect(adapter.providers[0].models[0].id).toBe("new");
  expect(calls.map(c => c.request.methodName)).toEqual(["list_providers", "list_models", "list_providers", "list_models", "list_providers"]);
});
