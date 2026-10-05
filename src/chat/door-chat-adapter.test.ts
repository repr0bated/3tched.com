import { afterEach, describe, expect, it, vi } from "vitest";
import type { RpcOptions } from "@protobuf-ts/runtime-rpc";
import { Value } from "../grpc/gen/google/protobuf/struct";
import { ErrorCode, type CallMethodRequest, type CallMethodResponse } from "../grpc/gen/operation";
import { PluginServiceClient } from "../grpc/gen/operation.client";
import { DoorError, OIA1_HEADER, PLUGIN_INTERFACE, PLUGIN_OBJECT_ROOT, IDENTITY_MODE_HEADER, IDENTITY_SESSION_HEADER } from "../grpc/door";
import { TCHED_ROUTER_METHODS, connectDoorChatAdapter } from "./door-chat-adapter";
import type { CatalogModel } from "./model-catalog";
import type { ChatResponse } from "./chat-adapter";

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

function mockDoor(handlers: Record<string, (args: unknown) => CallMethodResponse | Promise<CallMethodResponse>>) {
  const calls: Recorded[] = [];
  vi.spyOn(PluginServiceClient.prototype, "callMethod").mockImplementation(
    (request: CallMethodRequest, options?: RpcOptions) => {
      calls.push({ request, meta: options?.meta ?? {} });
      const handler = handlers[request.methodName];
      if (!handler) throw new Error(`unexpected method ${request.methodName}`);
      const args = request.arguments[0] ? Value.toJson(request.arguments[0]) : {};
      const response = handler(args);
      return Promise.resolve(response).then(response => ({ response })) as never;
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
    GetState: () =>
      envelope("GetState", {
        state: { status: "active", selected_provider: "", selected_model: "", providers: [], model_routes: [] },
      }),
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

it("retains fresh per-RPC bound identity through catalog construction and skips the unsupported broker", async () => {
  const methods: string[] = [];
  const assertions: unknown[] = [];
  vi.spyOn(PluginServiceClient.prototype, "callMethod").mockImplementation((request, options) => {
    methods.push(request.methodName);
    assertions.push(options?.meta?.[OIA1_HEADER]);
    const result = request.methodName === "list_providers"
      ? { providers: [{ provider_id: "vendor", configured: true, enabled: true }], revision: 1 }
      : request.methodName === "GetState"
        ? { state: { status: "active", selected_provider: "", selected_model: "" } }
      : { models: [], more: false, revision: 1 };
    return Promise.resolve({ response: envelope(request.methodName, result), headers: {
      [IDENTITY_MODE_HEADER]: "bound-oracle", [IDENTITY_SESSION_HEADER]: "assigned",
    } }) as never;
  });
  let nonce = 0;
  const nextIdentity = vi.fn(async () => ({ kind: "oia1" as const, assertion: btoa(`fresh-${++nonce}`) }));
  const adapter = await connectDoorChatAdapter({ ...config, boundOracle: { sessionId: "assigned", nextIdentity } });
  expect(assertions).toEqual([btoa("fresh-1"), btoa("fresh-2"), btoa("fresh-3")]);
  const status = vi.fn();
  const stop = adapter.followKnowledge(vi.fn(), status);
  stop();
  expect(status).toHaveBeenCalledWith({ state: "closed", reason: "Updates unavailable", retryInMs: null });
  expect(methods).toEqual(["list_providers", "list_models", "GetState"]);
});

describe("explicit conversation recovery", () => {
  const provider = { provider_id: "vendor", configured: true, enabled: true, status: "ok", control_plane_profiles: [] };
  it("uses the same credential and sealed recovery read once without generation or retaining private content", async () => {
    const calls = mockDoor({ ...catalog([provider]), list_episodes: () => envelope("list_episodes", { episodes: [{ private_text: "do not retain this" }] }) });
    const adapter = await connectDoorChatAdapter(config);
    expect(await adapter.recoverConversation!()).toBeUndefined();
    const recovery = calls.find(call => call.request.methodName === "list_episodes")!;
    expect(recovery.request).toMatchObject({ pluginId: "ctl_plane_chatbot", capabilityId: "chatbot.read" });
    expect(Value.toJson(recovery.request.arguments[0])).toEqual({ limit: 1 });
    expect(recovery.meta[OIA1_HEADER]).toBe(config.identity.assertion);
    expect(calls.filter(call => call.request.methodName === "list_episodes")).toHaveLength(1);
    expect(calls.some(call => call.request.methodName === "Chat")).toBe(false);
  });
  it("surfaces a real recovery diagnostic without retrying", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const calls = mockDoor({ ...catalog([provider]), list_episodes: () => ({ success: false, eventId: "0", eventHash: "", error: { code: ErrorCode.INTERNAL, message: "private projection recovery failed" } }) });
    const adapter = await connectDoorChatAdapter(config);
    await expect(adapter.recoverConversation!()).rejects.toThrow("private projection recovery failed");
    expect(calls.filter(call => call.request.methodName === "list_episodes")).toHaveLength(1);
    expect(calls.some(call => call.request.methodName === "Chat")).toBe(false);
  });
  it("rejects recovery completion after identity changes", async () => {
    let finish!: (response: CallMethodResponse) => void;
    const calls = mockDoor({ ...catalog([provider]), list_episodes: () => new Promise(resolve => { finish = resolve; }) });
    const adapter = await connectDoorChatAdapter(config);
    const recovery = adapter.recoverConversation!();
    adapter.setIdentity({ kind: "oia1", assertion: "RUZHSA==" });
    finish(envelope("list_episodes", {}));
    await expect(recovery).rejects.toThrow("context changed");
    expect(calls.at(-1)!.meta[OIA1_HEADER]).toBe(config.identity.assertion);
    expect(calls.filter(call => call.request.methodName === "list_episodes")).toHaveLength(1);
  });
});

const inferencePrefix = "https://inference.example/subscription";
const inferenceUri = `${inferencePrefix}/v1`;
function nativeReads(values: Record<string, string>): Record<string, (args: unknown) => CallMethodResponse> {
  return { config_get: (args: unknown) => {
    const path = (args as { path: string }).path;
    if (!(path in values)) throw new Error(`unexpected native config path ${path}`);
    return envelope("config_get", { value: values[path] });
  } };
}
async function expectNoGeneration(response: Promise<ChatResponse>, calls: Recorded[]) {
  const previous = calls.filter(call => call.request.methodName === "Chat").length;
  expect((await response).message.content).toMatch(/Apply|binding|context changed/);
  expect(calls.filter(call => call.request.methodName === "Chat")).toHaveLength(previous);
}

describe("ordinary catalog/native routing", () => {
  const selection = { providerId: "arbitrary_cozo_vendor", modelId: "vendor/model-v9" };
  const provider = { provider_id: selection.providerId, configured: true, enabled: true, status: "ok", native_provider_id: "provider_only.default", control_plane_profiles: ["cp_only.profile"] };
  const record: CatalogModel = { provider_id: selection.providerId, model_id: selection.modelId, available: true, native_provider_id: "dynamic-family.exact_alias", control_plane_profile: "cp_only.profile", inference_url_prefix: inferencePrefix };
  const reads = nativeReads({
    "providers.models.dynamic-family.exact_alias.uri": inferenceUri,
    "agents.control_plane.model_provider": "cp_only.profile",
    "providers.models.cp_only.profile.model": selection.modelId,
    "providers.models.cp_only.profile.uri": inferenceUri,
    "agents.accountability.model_provider": "audit.observed_alias",
    "providers.models.audit.observed_alias.model": selection.modelId,
    "providers.models.audit.observed_alias.uri": inferenceUri,
  });
  reads.resolve_catalog_model_binding = args => {
    const request = args as { provider_id: string; model_id: string };
    return envelope("resolve_catalog_model_binding", {
      provider_id: request.provider_id,
      model_id: request.model_id,
      reference: "dynamic-family.exact_alias",
      model: request.model_id,
      uri: inferenceUri,
      catalog_revision: 17,
    });
  };
  const reply = () => envelope("Chat", { content: "answer", provider: "dynamic-family", model: selection.modelId });
  const applyResult = (reference = "dynamic-family.exact_alias", model = selection.modelId) => ({ provider_id: selection.providerId, model_id: selection.modelId, reference, model, uri: inferenceUri, catalog_revision: 17 });
  const wire = (calls: Recorded[]) => Value.toJson(calls.filter(call => call.request.methodName === "Chat").at(-1)!.request.arguments[0]);

  it("applies the exact model binding and retains Cozo IDs from canonical readback", async () => {
    const selected_provider = "dynamic-family.exact_alias";
    const calls = mockDoor({
      ...catalog([provider], [record]),
      ...reads,
      apply_catalog_model_binding: args => {
        expect(args).toEqual({ provider_id: selection.providerId, model_id: selection.modelId });
        return envelope("apply_catalog_model_binding", applyResult(selected_provider));
      }, Chat: reply,
    });
    const adapter = await connectDoorChatAdapter(config);
    expect(adapter.providers[0].id).toBe(selection.providerId);
    await expectNoGeneration(adapter.submit({ message: "before apply", history: [], route: selection, mode: "personal" }), calls);
    expect(await adapter.selectRoute(selection)).toEqual(selection);
    await adapter.submit({ message: "after apply", history: [], route: selection, mode: "personal" });
    expect(wire(calls)).toMatchObject({ provider: record.native_provider_id, model: selection.modelId });
    expect(calls.some(call => call.request.methodName === "SetSelection" || call.request.methodName === "config_set" || call.request.methodName === "config_get")).toBe(false);
    for (const mode of ["control_plane", "accountability"] as const) {
      await adapter.submit({ message: "singleton", history: [], route: selection, mode });
      expect(wire(calls)).not.toHaveProperty("provider");
      expect(wire(calls)).not.toHaveProperty("model");
    }
    await expectNoGeneration(adapter.submit({ message: "different draft", history: [], route: { ...selection, modelId: "another" }, mode: "personal" }), calls);
  });

  it("resolves an exact runtime profile when the catalog static binding is absent", async () => {
    const model = { ...record, native_provider_id: null };
    const calls = mockDoor({ ...catalog([provider], [model]), ...reads, apply_catalog_model_binding: () => envelope("apply_catalog_model_binding", applyResult()), Chat: reply });
    const adapter = await connectDoorChatAdapter(config);
    expect(adapter.providers[0].models[0].id).toBe(selection.modelId);
    await expect(adapter.selectRoute(selection)).resolves.toEqual(selection);
    const resolves = calls.filter(call => call.request.methodName === "resolve_catalog_model_binding");
    expect(resolves).toHaveLength(2);
    expect(resolves[0].request).toMatchObject({ pluginId: "tched_router", capabilityId: TCHED_ROUTER_METHODS.ResolveCatalogModelBinding });
    expect(Value.toJson(resolves[0].request.arguments[0])).toEqual({ provider_id: selection.providerId, model_id: selection.modelId });
    const apply = calls.find(call => call.request.methodName === "apply_catalog_model_binding")!;
    expect(apply.request).toMatchObject({ pluginId: "tched_router", capabilityId: TCHED_ROUTER_METHODS.ApplyCatalogModelBinding });
    expect(Value.toJson(apply.request.arguments[0])).toEqual({ provider_id: selection.providerId, model_id: selection.modelId });
  });

  it.each([
    { result: { provider_id: "wrong", model_id: selection.modelId, reference: "dynamic-family.exact_alias", model: selection.modelId, uri: inferenceUri, catalog_revision: 17 }, error: "different catalog provider or model" },
    { result: { provider_id: selection.providerId, model_id: selection.modelId, reference: "dynamic-family.exact_alias", model: "wrong", uri: inferenceUri, catalog_revision: 17 }, error: "differs from the selected catalog model" },
    { result: { provider_id: selection.providerId, model_id: selection.modelId, reference: "dynamic-family.exact_alias", model: selection.modelId, uri: "https://inference.example/other", catalog_revision: 17 }, error: "does not match" },
    { result: { provider_id: selection.providerId, model_id: selection.modelId, reference: "dynamic-family.alias.extra", model: selection.modelId, uri: inferenceUri, catalog_revision: 17 }, error: "invalid native routing binding" },
    { result: { provider_id: selection.providerId, model_id: selection.modelId, reference: "dynamic-family.exact_alias", model: selection.modelId, uri: "https://u:p@inference.example/subscription/v1", catalog_revision: 17 }, error: "credential-free HTTPS" },
  ])("rejects unsafe or mismatched reflected binding", async ({ result, error }) => {
    const calls = mockDoor({ ...catalog([provider], [record]), resolve_catalog_model_binding: () => envelope("resolve_catalog_model_binding", result) });
    const adapter = await connectDoorChatAdapter(config);
    await expect(adapter.selectRoute(selection)).rejects.toThrow(error);
    expect(calls.some(call => call.request.methodName === "apply_catalog_model_binding" || call.request.methodName === "SetSelection" || call.request.methodName === "config_set")).toBe(false);
    expect(calls.some(call => call.request.methodName === "Chat")).toBe(false);
  });

  it("does not confirm Apply if the reflected binding changes during readback", async () => {
    let count = 0;
    const calls = mockDoor({ ...catalog([provider], [record]), ...reads, resolve_catalog_model_binding: args => {
      const request = args as { provider_id: string; model_id: string };
      count += 1;
      return envelope("resolve_catalog_model_binding", { provider_id: request.provider_id, model_id: request.model_id, reference: count === 1 ? "dynamic-family.exact_alias" : "dynamic-family.changed_alias", model: request.model_id, uri: inferenceUri, catalog_revision: 17 });
    }, apply_catalog_model_binding: () => envelope("apply_catalog_model_binding", applyResult()) });
    const adapter = await connectDoorChatAdapter(config);
    await expect(adapter.selectRoute(selection)).rejects.toThrow("binding changed during Apply");
    await expectNoGeneration(adapter.submit({ message: "no confirmation", history: [], route: selection, mode: "personal" }), calls);
    expect(calls.filter(call => call.request.methodName === "apply_catalog_model_binding")).toHaveLength(1);
  });

  it("rechecks the reflected binding immediately before ordinary Chat", async () => {
    let count = 0;
    const calls = mockDoor({ ...catalog([provider], [record]), ...reads, resolve_catalog_model_binding: args => {
      const request = args as { provider_id: string; model_id: string };
      count += 1;
      return envelope("resolve_catalog_model_binding", { provider_id: request.provider_id, model_id: request.model_id, reference: count < 3 ? "dynamic-family.exact_alias" : "dynamic-family.changed_alias", model: request.model_id, uri: inferenceUri, catalog_revision: 17 });
    }, apply_catalog_model_binding: () => envelope("apply_catalog_model_binding", applyResult()), Chat: reply });
    const adapter = await connectDoorChatAdapter(config);
    await adapter.selectRoute(selection);
    await expectNoGeneration(adapter.submit({ message: "binding drift", history: [], route: selection, mode: "personal" }), calls);
    expect(calls.filter(call => call.request.methodName === "Chat")).toHaveLength(0);
  });

  it.each([
    { providerId: "missing_vendor", modelId: selection.modelId },
    { providerId: selection.providerId, modelId: "missing_model" },
  ])("validates the exact available catalog pair before mutation: $providerId/$modelId", async route => {
    const calls = mockDoor({ ...catalog([provider], [record]) });
    const adapter = await connectDoorChatAdapter(config);
    await expect(adapter.selectRoute(route)).rejects.toThrow("not available");
    expect(calls.some(call => call.request.methodName === "apply_catalog_model_binding" || call.request.methodName === "SetSelection" || call.request.methodName === "config_set")).toBe(false);
  });

  it("rejects an unavailable model without removing it from the choices", async () => {
    const calls = mockDoor({ ...catalog([provider], [{ ...record, available: false }]) });
    const adapter = await connectDoorChatAdapter(config);
    expect(adapter.providers[0].models[0].id).toBe(selection.modelId);
    await expect(adapter.selectRoute(selection)).rejects.toThrow("not available");
    expect(calls.some(call => call.request.methodName === "apply_catalog_model_binding" || call.request.methodName === "SetSelection" || call.request.methodName === "config_set")).toBe(false);
  });

  it.each([
    { result: applyResult("dynamic-family.other_alias"), message: "differs from its preflight" },
    { result: applyResult("different-family.exact_alias"), message: "differs from its preflight" },
    { result: applyResult("dynamic-family.exact_alias", "wrong-model"), message: "differs from the selected catalog model" },
    { result: { ...applyResult(), uri: "https://u:p@inference.example/subscription/v1" }, message: "credential-free HTTPS" },
  ])("rejects differing or unsafe apply readback", async ({ result, message }) => {
    const calls = mockDoor({ ...catalog([provider], [record]), ...reads, apply_catalog_model_binding: () => envelope("apply_catalog_model_binding", result), Chat: reply });
    const adapter = await connectDoorChatAdapter(config);
    await expect(adapter.selectRoute(selection)).rejects.toThrow(message);
    await expectNoGeneration(adapter.submit({ message: "no confirmed route", history: [], route: selection, mode: "personal" }), calls);
    expect(calls.some(call => call.request.methodName === "SetSelection" || call.request.methodName === "config_set")).toBe(false);
  });

  it("captures the applied binding immutably rather than rebinding it from a later catalog", async () => {
    const records = [{ ...record }];
    const calls = mockDoor({ ...catalog([provider], records), ...reads, apply_catalog_model_binding: () => envelope("apply_catalog_model_binding", applyResult()), Chat: reply });
    const adapter = await connectDoorChatAdapter(config);
    await adapter.selectRoute(selection);
    records[0].native_provider_id = "new-family.different_alias";
    await adapter.refreshProviders!();
    await adapter.submit({ message: "retain applied binding", history: [], route: selection, mode: "personal" });
    expect(wire(calls)).toMatchObject({ provider: record.native_provider_id, model: selection.modelId });
    await expect(adapter.selectRoute({ ...selection, modelId: "missing" })).rejects.toThrow("not available");
    await expectNoGeneration(adapter.submit({ message: "failed attempt cleared assertion", history: [], route: selection, mode: "personal" }), calls);
  });

  it("invalidates a successful capture on identity replacement", async () => {
    const calls = mockDoor({ ...catalog([provider], [record]), ...reads, apply_catalog_model_binding: () => envelope("apply_catalog_model_binding", applyResult()), Chat: reply });
    const adapter = await connectDoorChatAdapter(config);
    await adapter.selectRoute(selection);
    adapter.setIdentity({ kind: "oia1", assertion: "RUZHSA==" });
    await expectNoGeneration(adapter.submit({ message: "new identity", history: [], route: selection, mode: "personal" }), calls);
  });

  it("does not capture a late Apply response after identity replacement", async () => {
    let finish!: (response: CallMethodResponse) => void;
    const calls = mockDoor({ ...catalog([provider], [record]), ...reads, apply_catalog_model_binding: () => new Promise(resolve => { finish = resolve; }), Chat: reply });
    const adapter = await connectDoorChatAdapter(config);
    const applying = adapter.selectRoute(selection);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    adapter.setIdentity({ kind: "oia1", assertion: "RUZHSA==" });
    finish(envelope("apply_catalog_model_binding", applyResult()));
    await expect(applying).rejects.toThrow("context changed");
    await expectNoGeneration(adapter.submit({ message: "no stale assertion", history: [], route: selection, mode: "personal" }), calls);
  });

  it("does not mutate after a reflected binding read returns to a stale identity", async () => {
    let finish!: (response: CallMethodResponse) => void;
    const calls = mockDoor({ ...catalog([provider], [record]), resolve_catalog_model_binding: args => new Promise(resolve => {
      const request = args as { provider_id: string; model_id: string };
      finish = resolve;
      void request;
    }) });
    const adapter = await connectDoorChatAdapter(config);
    const applying = adapter.selectRoute(selection);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    adapter.setIdentity({ kind: "oia1", assertion: "RUZHSA==" });
    finish(envelope("resolve_catalog_model_binding", { provider_id: selection.providerId, model_id: selection.modelId, reference: "dynamic-family.exact_alias", model: selection.modelId, uri: inferenceUri, catalog_revision: 17 }));
    await expect(applying).rejects.toThrow("context changed");
    expect(calls.some(call => call.request.methodName === "apply_catalog_model_binding" || call.request.methodName === "SetSelection" || call.request.methodName === "config_set")).toBe(false);
  });

  it("clears ordinary assertions when a protected selection is attempted", async () => {
    const calls = mockDoor({ ...catalog([provider], [record]), ...reads, apply_catalog_model_binding: () => envelope("apply_catalog_model_binding", applyResult()), Chat: reply });
    const adapter = await connectDoorChatAdapter(config);
    await adapter.selectRoute(selection);
    await expect(adapter.controlPlane.set({ ...selection, modelId: "missing" }, vi.fn())).rejects.toThrow();
    await expectNoGeneration(adapter.submit({ message: "server route", history: [], route: selection, mode: "personal" }), calls);
  });

  it("reports the actual Chat error without unrelated canned suggestions", async () => {
    mockDoor({ ...catalog([provider], [record]), ...reads, apply_catalog_model_binding: () => envelope("apply_catalog_model_binding", applyResult()), Chat: () => ({ success: false, eventId: "0", eventHash: "", error: { code: ErrorCode.VALIDATION_FAILED, message: "native route unavailable" } }) });
    const adapter = await connectDoorChatAdapter(config);
    await adapter.selectRoute(selection);
    const response = await adapter.submit({ message: "hi", history: [], route: selection, mode: "personal" });
    expect(response.message.content).toBe("⚠️ Chat unavailable: native route unavailable");
  });
});

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
    expect(adapter.committedRoute).toBeNull();
    expect(calls.some((call) => call.request.methodName === "GetState")).toBe(true);
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

  it("uses the refreshed shared catalog for an exact protected Control Plane change over the door", async () => {
    const records = [
      { provider_id: "dynamic_vendor", model_id: "a-old", name: "Old", available: true, control_plane_profile: "custom.dynamic_route", inference_url_prefix: inferencePrefix },
      { provider_id: "dynamic_vendor", model_id: "b-unbound", name: "Visible without binding", available: true },
    ];
    let nativeModel = "a-old";
    const calls = mockDoor({
      ...catalog([{ provider_id: "dynamic_vendor", name: "Dynamic", configured: true, enabled: true, status: "ok", control_plane_profiles: [] }], records),
      config_get: args => envelope("config_get", {
        value: (args as { path: string }).path === "agents.control_plane.model_provider" ? "custom.dynamic_route" : (args as { path: string }).path.endsWith(".uri") ? inferenceUri : nativeModel,
      }),
      authorize_task: () => envelope("authorize_task", {}),
      config_patch: args => {
        const { operations } = args as { operations: Array<{ op: string; path: string; value: string }> };
        expect(operations).toEqual([
          { op: "test", path: "/agents/control_plane/model_provider", value: "custom.dynamic_route" },
          { op: "test", path: "/providers/models/custom/dynamic_route/model", value: "a-old" },
          { op: "test", path: "/providers/models/custom/dynamic_route/uri", value: inferenceUri },
          { op: "replace", path: "/providers/models/custom/dynamic_route/model", value: "c-new/from-provider" },
          { op: "replace", path: "/agents/control_plane/model_provider", value: "custom.dynamic_route" },
        ]);
        nativeModel = operations[3].value;
        return envelope("config_patch", {});
      },
      Chat: () => envelope("Chat", { content: "native route answer", provider: "custom", model: nativeModel, finish_reason: "stop", usage: {} }),
    });
    const adapter = await connectDoorChatAdapter(config);
    expect(adapter.providers[0].models.map(model => model.id)).toEqual(["a-old", "b-unbound"]);
    expect(await adapter.controlPlane.current()).toEqual({ providerId: "dynamic_vendor", modelId: "a-old" });
    records.push({ provider_id: "dynamic_vendor", model_id: "c-new/from-provider", name: "Discovered model", available: true, control_plane_profile: "custom.dynamic_route", inference_url_prefix: inferencePrefix });
    await adapter.refreshProviders!();
    expect(adapter.providers[0].models.map(model => model.id)).toEqual(["a-old", "b-unbound", "c-new/from-provider"]);
    const selection = { providerId: "dynamic_vendor", modelId: "c-new/from-provider" };
    await adapter.controlPlane.set(selection, async (plugin, method, args) => {
      expect(calls.some(call => call.request.methodName === "config_patch")).toBe(false);
      await adapter.authorizeTask(plugin, method, args, "fixture-password");
    });
    expect(await adapter.controlPlane.current()).toEqual(selection);
    const ticket = calls.find(call => call.request.methodName === "authorize_task")!;
    const patch = calls.find(call => call.request.methodName === "config_patch")!;
    const ticketArgs = Value.toJson(ticket.request.arguments[0]) as { plugin: string; method: string; args: unknown; password: string };
    expect(ticketArgs).toEqual({ plugin: "tched_router", method: "config_patch", args: Value.toJson(patch.request.arguments[0]), password: "fixture-password" });
    expect(ticket.request.pluginId).toBe("elevation");
    expect(ticket.request.capabilityId).toBe("elevation.authorize");
    expect(patch.request.capabilityId).toBe("cap.software.tched-router.router.write@v1");
    expect(ticket.meta[OIA1_HEADER]).toBe(config.identity.assertion);
    expect(patch.meta[OIA1_HEADER]).toBe(config.identity.assertion);
    expect(calls.some(call => call.request.methodName === "SetSelection" || call.request.methodName === "config_set")).toBe(false);

    const ordinaryRoute = { providerId: "ordinary-provider", modelId: "ordinary-model" };
    await adapter.submit({ message: "control answer", history: [], route: ordinaryRoute, mode: "control_plane" });
    const cpChat = calls.filter(call => call.request.methodName === "Chat").at(-1)!;
    expect(Value.toJson(cpChat.request.arguments[0])).not.toHaveProperty("provider");
    expect(Value.toJson(cpChat.request.arguments[0])).not.toHaveProperty("model");
    await expectNoGeneration(adapter.submit({ message: "personal answer", history: [], route: ordinaryRoute, mode: "personal" }), calls);
  });

  it("commits the route through the scoped catalog operation and sends the conversation to Chat", async () => {
    const calls = mockDoor({
      ...catalog([
        { provider_id: "openrouter", name: "OpenRouter", configured: true, enabled: true, status: "ok", control_plane_profiles: [] },
      ], [{ provider_id: "openrouter", model_id: "gemma", available: true, native_provider_id: "local.demo_route", inference_url_prefix: inferencePrefix }]),
      resolve_catalog_model_binding: args => envelope("resolve_catalog_model_binding", { ...(args as object), reference: "local.demo_route", model: "gemma", uri: inferenceUri, catalog_revision: 1 }),
      ...nativeReads({ "providers.models.local.demo_route.uri": inferenceUri }),
      GetState: () =>
        envelope("GetState", { state: {
          status: "active", selected_provider: "local", selected_model: "gemma",
          providers: [{ id: "local", kind: "local", description: "", aliases: [] }],
          model_routes: [{ provider: "local", model: "gemma", hint: "local", kind: "chat", available: true, status: "", status_reason: "" }],
        } }),
      apply_catalog_model_binding: args => envelope("apply_catalog_model_binding", { ...(args as object), reference: "local.demo_route", model: "gemma", uri: inferenceUri, catalog_revision: 1 }),
      Chat: () =>
        envelope("Chat", { content: "hello from the router", provider: "local", model: "gemma", finish_reason: "stop", usage: {} }),
    });

    const adapter = await connectDoorChatAdapter(config);
    const route = await adapter.selectRoute({ providerId: "openrouter", modelId: "gemma" });
    expect(route).toEqual({ providerId: "openrouter", modelId: "gemma" });

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
    expect({ provider: args.provider, model: args.model }).toEqual({ provider: "local.demo_route", model: "gemma" });
  });

  it("does not send the personal provider or model in Control Plane mode", async () => {
    const calls = mockDoor({
      ...catalog([
        { provider_id: "openrouter", name: "OpenRouter", configured: true, enabled: true, status: "ok", control_plane_profiles: [] },
      ], [{ provider_id: "openrouter", model_id: "gemma", available: true, control_plane_profile: "custom.cp_route", inference_url_prefix: inferencePrefix }]),
      ...nativeReads({ "agents.control_plane.model_provider": "custom.cp_route", "providers.models.custom.cp_route.model": "gemma", "providers.models.custom.cp_route.uri": inferenceUri }),
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
  it.each((["personal", "control_plane", "accountability"] as const).flatMap(mode =>
    (["json-render", "spec", "raw-json", "raw-jsonl"] as const).map(format => ({ mode, format })),
  ))("offers validated catalog presentation in $mode mode from $format", async ({ mode, format }) => {
    const spec = { root: "status", elements: { status: { type: "dashboardStatus", props: { label: "Example only", tone: "info" } } } };
    const patches = [
      { op: "add", path: "/root", value: spec.root },
      { op: "add", path: "/elements/status", value: spec.elements.status },
    ].map(patch => JSON.stringify(patch)).join("\n");
    const reply = format === "raw-json" ? JSON.stringify(spec) : format === "raw-jsonl" ? patches
      : `Status\n\`\`\`${format}\n${format === "spec" ? patches : JSON.stringify(spec)}\n\`\`\``;
    const calls = mockDoor({
      ...catalog([
        { provider_id: "openrouter", name: "OpenRouter", configured: true, enabled: true, status: "ok", control_plane_profiles: [] },
      ], [{ provider_id: "openrouter", model_id: "demo", available: true, native_provider_id: "custom.demo", control_plane_profile: "custom.cp_route", inference_url_prefix: inferencePrefix }]),
      resolve_catalog_model_binding: args => envelope("resolve_catalog_model_binding", { ...(args as object), reference: "custom.demo", model: "demo", uri: inferenceUri, catalog_revision: 1 }),
      ...nativeReads({ "providers.models.custom.demo.uri": inferenceUri, "agents.control_plane.model_provider": "custom.cp_route", "providers.models.custom.cp_route.model": "demo", "providers.models.custom.cp_route.uri": inferenceUri, "agents.accountability.model_provider": "custom.audit_route", "providers.models.custom.audit_route.model": "demo", "providers.models.custom.audit_route.uri": inferenceUri }),
      apply_catalog_model_binding: args => envelope("apply_catalog_model_binding", { ...(args as object), reference: "custom.demo", model: "demo", uri: inferenceUri, catalog_revision: 1 }),
      GetState: () => envelope("GetState", { state: { status: "active", selected_provider: "local", selected_model: "demo", providers: [{ id: "local", kind: "local", description: "", aliases: [] }], model_routes: [{ provider: "local", model: "demo", hint: "", kind: "chat", available: true, status: "", status_reason: "" }] } }),
      Chat: () => envelope("Chat", { content: reply, provider: "local", model: "demo" }),
    });
    const adapter = await connectDoorChatAdapter(config);
    const route = { providerId: "openrouter", modelId: "demo" };
    if (mode === "personal") await adapter.selectRoute(route);
    const response = await adapter.submit({ message: "show status", history: [], route, mode });
    expect(response.canvasSpec).toMatchObject(spec);
    expect(response.message.content).toBe(format.startsWith("raw-") ? "Rendered the requested interface." : "Status");
    const chat = calls.find(call => call.request.methodName === "Chat")!;
    const args = Value.toJson(chat.request.arguments[0]) as { message: string; messages: { content: string }[]; provider?: string; model?: string };
    expect(args.message).toContain("optionally include exactly one fenced spec block");
    expect(args.message).toContain("dashboardStatus");
    expect(args.messages.at(-1)?.content).toBe(args.message);
    expect(args.provider).toBe(mode === "personal" ? "custom.demo" : undefined);
    expect(args.model).toBe(mode === "personal" ? "demo" : undefined);
  });

  it("supplies the implemented catalog in UI render mode and validates the returned canvas", async () => {
    const spec = { root: "status", elements: { status: { type: "dashboardStatus", props: { label: "Example only", tone: "info" } } } };
    const calls = mockDoor({
      ...catalog([
        { provider_id: "openrouter", name: "OpenRouter", configured: true, enabled: true, status: "ok", control_plane_profiles: [] },
      ], [{ provider_id: "openrouter", model_id: "demo", available: true, native_provider_id: "custom.demo", inference_url_prefix: inferencePrefix }]),
      resolve_catalog_model_binding: args => envelope("resolve_catalog_model_binding", { ...(args as object), reference: "custom.demo", model: "demo", uri: inferenceUri, catalog_revision: 1 }),
      ...nativeReads({ "providers.models.custom.demo.uri": inferenceUri }),
      apply_catalog_model_binding: args => envelope("apply_catalog_model_binding", { ...(args as object), reference: "custom.demo", model: "demo", uri: inferenceUri, catalog_revision: 1 }),
      GetState: () => envelope("GetState", { state: { status: "active", selected_provider: "local", selected_model: "demo", providers: [{ id: "local", kind: "local", description: "", aliases: [] }], model_routes: [{ provider: "local", model: "demo", hint: "", kind: "chat", available: true, status: "", status_reason: "" }] } }),
      Chat: () => envelope("Chat", { content: `Preview\n\`\`\`json-render\n${JSON.stringify(spec)}\n\`\`\``, provider: "local", model: "demo" }),
    });
    const adapter = await connectDoorChatAdapter(config);
    const route = await adapter.selectRoute({ providerId: "openrouter", modelId: "demo" });
    const response = await adapter.submit({ message: "show btrfs", history: [], route, mode: "ui_render" });
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
    GetState: () =>
      envelope("GetState", {
        state: { status: "active", selected_provider: "", selected_model: "", providers: [], model_routes: [] },
      }),
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
  expect(calls.map(c => c.request.methodName)).toEqual([
    "list_providers",
    "list_models",
    "GetState",
    "list_providers",
    "list_models",
    "list_providers",
  ]);
});
