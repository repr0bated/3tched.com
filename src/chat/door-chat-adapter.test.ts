import { afterEach, describe, expect, it, vi } from "vitest";
import { RpcError, type RpcOptions } from "@protobuf-ts/runtime-rpc";
import { Value } from "../grpc/gen/google/protobuf/struct";
import { ErrorCode, type CallMethodRequest, type CallMethodResponse } from "../grpc/gen/operation";
import { PluginServiceClient } from "../grpc/gen/operation.client";
import { DoorError, OIA1_HEADER, PLUGIN_INTERFACE, PLUGIN_OBJECT_ROOT, IDENTITY_MODE_HEADER, IDENTITY_SESSION_HEADER } from "../grpc/door";
import { CHAT_RESPONSE_CAPS, CHAT_RESPONSE_METHODS, TCHED_ROUTER_METHODS, connectDoorChatAdapter } from "./door-chat-adapter";
import type { CatalogModel } from "./model-catalog";
import type { ChatResponse } from "./chat-adapter";
import type { ChatMode } from "./chat-mode";
import { ChatSession, type ChatRuntime } from "../svelte/chat-session";

type Recorded = { request: CallMethodRequest; meta: NonNullable<RpcOptions["meta"]>; timeout: RpcOptions["timeout"] };

function envelope(method: string, result: unknown, pluginId = "chat_router"): CallMethodResponse {
  return {
    success: true,
    result: Value.fromJson({
      success: true,
      event_id: 7,
      event_hash: `hash-${method}`,
      plugin_id: pluginId,
      method,
      result: result as never,
    }),
    eventId: "7",
    eventHash: `hash-${method}`,
  };
}

<<<<<<< Updated upstream
const fixtureUiAuthoring = {
  format: "threetched-ui-authoring-v1",
  instructions: "Use the implemented Svelte catalog and registry. A visual does not grant tool access.",
  documents: [{
    path: "references/upstream/json-render/svelte-guide.md",
    content: "Svelte reference fixture content.",
    repository: "https://github.com/example/docs",
    revision: "0123456789abcdef0123456789abcdef01234567",
    source_path: "docs/svelte-guide.md",
    sha256: "b".repeat(64),
  }, {
    path: "references/unselected/private.md",
    content: "unselected-document-secret",
    repository: "https://github.com/example/docs",
    revision: "0123456789abcdef0123456789abcdef01234567",
    source_path: "docs/private.md",
    sha256: "c".repeat(64),
  }],
  prompt_document_paths: ["references/upstream/json-render/svelte-guide.md"],
};

function mockDoor(
  handlers: Record<string, (args: unknown) => CallMethodResponse | Promise<CallMethodResponse>>,
  contextMode: ChatMode | (() => ChatMode) = "personal",
) {
=======
/** Committed chatbot reply: start → submit_turn → get_turn_response. */
function chatResponseHandlers(message = "answer", extras: Record<string, unknown> = {}) {
  const conversationId = "11111111-1111-7111-8111-111111111111";
  const turnId = "22222222-2222-7222-8222-222222222222";
  let pending: { conversation_id: string; turn_id: string; turn_index: number } | null = null;
  return {
    start_conversation: () => envelope("start_conversation", { conversation_id: conversationId, started_at: "2026-10-24T00:00:00Z" }, "chat_response"),
    submit_turn: (args: unknown) => {
      const input = args as { conversation_id: string; message: string; response_mode: string };
      pending = { conversation_id: input.conversation_id, turn_id: turnId, turn_index: 1 };
      return envelope("submit_turn", pending, "chat_response");
    },
    get_turn_response: () => {
      if (!pending) return envelope("get_turn_response", { turn: null }, "chat_response");
      return envelope("get_turn_response", {
        turn: {
          principal_id: "human",
          session_id: "session",
          session_genesis: "genesis",
          conversation_id: pending.conversation_id,
          turn_id: pending.turn_id,
          turn_index: pending.turn_index,
          response_id: "33333333-3333-7333-8333-333333333333",
          responder_principal_id: "chatbot",
          opened_at: "2026-10-24T00:00:01Z",
          committed_at: "2026-10-24T00:00:02Z",
          prev_turn_hash: "prev",
          turn_hash: "turn-hash",
          content_hash: "content-hash",
          request_event_id: 7,
          request_event_hash: "hash-submit_turn",
          canvas_schema_hash: extras.canvas_schema_hash ?? null,
          content: extras.content ?? { kind: "user_response", message, message_type: "info", related_actions: [], canvas: extras.canvas ?? null },
        },
      }, "chat_response");
    },
  };
}

function mockDoor(handlers: Record<string, (args: unknown) => CallMethodResponse | Promise<CallMethodResponse>>) {
>>>>>>> Stashed changes
  const calls: Recorded[] = [];
  vi.spyOn(PluginServiceClient.prototype, "callMethod").mockImplementation(
    (request: CallMethodRequest, options?: RpcOptions) => {
      calls.push({ request, meta: options?.meta ?? {}, timeout: options?.timeout });
      const args = request.arguments[0] ? Value.toJson(request.arguments[0]) : {};
      const fallback: ((args: unknown) => CallMethodResponse) | undefined = request.methodName === "schema_read"
        ? () => {
          const pluginId = (args as { plugin_id?: string }).plugin_id;
          return pluginId === "json_render"
            ? envelope("schema_read", { plugin_id: "json_render", schema_hash: "d".repeat(64), schema: { name: "json_render", fields: { ui_authoring: { default: fixtureUiAuthoring }, private_state: { default: "schema-secret" } }, methods: { hidden: { description: "method-secret" } } } })
            : envelope("schema_read", { plugin_id: "model_registry", schema_hash: "a".repeat(64), schema: { name: "model_registry", description: "[chatbot-guide:v1] fixture provider guide" } });
        }
        : request.methodName === "get_context"
          ? () => envelope("get_context", {
            mode: typeof contextMode === "function" ? contextMode() : contextMode,
            effective_capabilities: ["chat.context", "json_render.read"],
            session_id: "private-session-fixture",
          })
          : undefined;
      const handler = handlers[request.methodName] ?? fallback;
      if (!handler) throw new Error(`unexpected method ${request.methodName}`);
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
<<<<<<< Updated upstream
    refresh: () => envelope("refresh", {
      refreshed_at: "2026-10-11T14:36:00Z", revision: 1,
      providers: providers.map(provider => ({
        provider_id: (provider as { provider_id: string }).provider_id,
        status: "ok", available_models: 0, added: 0, dropped: 0,
      })),
    }),
=======
    get_own_agent_route_access: () => envelope("get_own_agent_route_access", { can_apply: false }),
>>>>>>> Stashed changes
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

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("discovers and calls dotted threetched methods through the caller's mounted catalog", async () => {
  // Identity fields from the mounted models.list/metadata.json, 2026-10-22.
  const declaration = {
    name: "models.list", args: { type: "object" }, returns: { type: "object" }, side_effect: "mutation",
    idempotent: false,
    required_capability: "cap.software.threetched.call.ccc2ba7f9b4187900c4a578019288c511d8f031d3409f666757655be1ee3631b4@v1",
    subid: "mut.software.threetched.call.ccc2ba7f9b4187900c4a578019288c511d8f031d3409f666757655be1ee3631b4@v1",
  };
  const schemaHash = "schema-threetched-1";
  const mounted = {
    views: [
      { view_id: "a", source_catalog_hash: "h", source_catalog_generation: 1, plugins: [] },
      {
        view_id: "b", source_catalog_hash: "h", source_catalog_generation: 1,
        plugins: [{
          plugin_id: "threetched", object_hash: "obj", schema_hash: schemaHash, state: "not_requested",
          schema: { methods: { "models.list": declaration } },
          operations: [{
            method: "models.list",
            call_path: "plugins/threetched/operations/models.list/call",
            metadata_path: "plugins/threetched/operations/models.list/metadata.json",
            currently_granted: true,
          }],
        }],
      },
    ],
  };
  let invokeCount = 0;
  const calls = mockDoor({
    ...catalog([{ provider_id: "catalog", configured: true, enabled: true, status: "ok", control_plane_profiles: [] }]),
    get_catalog: () => envelope("get_catalog", mounted, "tched_fs"),
    "models.list": () => {
      invokeCount += 1;
      if (invokeCount === 2) {
        return { success: false, eventId: "0", eventHash: "", error: { code: ErrorCode.VALIDATION_FAILED, message: "method_outcome_unknown; operation_id=unconfirmed; do not retry automatically" } };
      }
      if (invokeCount === 3) throw new RpcError("connection closed", "UNAVAILABLE");
      return envelope("models.list", { stdout: "model-a", stderr: "", exit: 0 }, "threetched");
    },
  });
  const adapter = await connectDoorChatAdapter(config);
  const methods = await adapter.binarySurface.describe();
  expect(methods).toEqual([{
    plugin_id: "threetched", method: "models.list",
    path: "plugins/threetched/operations/models.list/call",
    declaration,
  }]);
  expect(await adapter.binarySurface.invoke(methods[0], {}, true)).toEqual({ stdout: "model-a", stderr: "", exit: 0 });
  const invoke = calls.find(call => call.request.methodName === "models.list")!;
  expect(invoke.request).toMatchObject({ pluginId: "threetched", capabilityId: declaration.required_capability });
  expect(invoke.meta[OIA1_HEADER]).toBe(config.identity.assertion);
  await expect(adapter.binarySurface.invoke(methods[0], {}, true)).rejects.toThrow("method_outcome_unknown");
  await expect(adapter.binarySurface.invoke(methods[0], {}, true))
    .rejects.toThrow(/unavailable|outcome unknown|not reachable/i);
});

it("retains fresh per-RPC bound identity through catalog construction and skips the unsupported broker", async () => {
  const methods: string[] = [];
  const assertions: unknown[] = [];
  vi.spyOn(PluginServiceClient.prototype, "callMethod").mockImplementation((request, options) => {
    methods.push(request.methodName);
    assertions.push(options?.meta?.[OIA1_HEADER]);
    const result = request.methodName === "refresh"
      ? { refreshed_at: "2026-10-11T14:36:00Z", revision: 1, providers: [] }
      : request.methodName === "list_providers"
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
  expect(assertions).toEqual([btoa("fresh-1"), btoa("fresh-2"), btoa("fresh-3"), btoa("fresh-4")]);
  const status = vi.fn();
  const stop = adapter.followKnowledge(vi.fn(), status);
  stop();
  expect(status).toHaveBeenCalledWith({ state: "closed", reason: "Updates unavailable", retryInMs: null });
  expect(methods).toEqual(["refresh", "list_providers", "list_models", "GetState"]);
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
<<<<<<< Updated upstream
async function expectNoGeneration(response: Promise<ChatResponse>, calls: Recorded[]) {
  const previous = calls.filter(call => call.request.methodName === "Chat").length;
  const refused = await response;
  expect(refused.message.content).toMatch(/Apply|binding|context changed/);
  expect(refused.historyEligible).toBe(false);
  expect(calls.filter(call => call.request.methodName === "Chat")).toHaveLength(previous);
=======
async function expectCommittedResponse(submit: () => Promise<ChatResponse>, calls: Recorded[]) {
  const previous = calls.filter(call => call.request.methodName === "submit_turn").length;
  expect((await submit()).message.content).toMatch(/answer/);
  expect(calls.filter(call => call.request.methodName === "submit_turn")).toHaveLength(previous + 1);
  expect(calls.some(call => call.request.methodName === "Chat" || call.request.methodName === "generate_spec")).toBe(false);
>>>>>>> Stashed changes
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
  const chatReply = chatResponseHandlers("answer");
  const applyResult = (reference = "dynamic-family.exact_alias", model = selection.modelId) => ({ provider_id: selection.providerId, model_id: selection.modelId, reference, model, uri: inferenceUri, catalog_revision: 17 });
<<<<<<< Updated upstream
  type ChatWire = { message: string; messages: { role: string; content: string }[]; provider?: string; model?: string };
  const wire = (calls: Recorded[]) => Value.toJson(calls.filter(call => call.request.methodName === "Chat").at(-1)!.request.arguments[0]) as ChatWire;

  it.each(["personal", "project", "control_plane", "accountability", "notebook_lm", "ui_render"] as const)("consumes the selected provider guide in %s", async mode => {
    const calls = mockDoor({ ...catalog([provider], [record]), ...reads,
      apply_catalog_model_binding: () => envelope("apply_catalog_model_binding", applyResult()), Chat: reply }, mode);
    const adapter = await connectDoorChatAdapter(config);
    if (mode !== "control_plane" && mode !== "accountability") await adapter.selectRoute(selection);
    await adapter.submit({ message: "hello", history: [], route: selection, mode });
    expect(wire(calls)).toMatchObject({ message: expect.stringContaining("fixture provider guide") });
    expect(wire(calls).message).toContain("Use the implemented Svelte catalog and registry.");
    expect(wire(calls).message).toContain("Svelte reference fixture content.");
    expect(wire(calls).message).not.toContain("unselected-document-secret");
    expect(wire(calls).message).not.toContain("private-session-fixture");
    expect(wire(calls).message).toContain("do not provide model tools");
    expect(wire(calls).message).toContain(`mode=${mode}`);
    expect(calls.filter(call => call.request.methodName === "schema_read")).toHaveLength(2);
    expect(calls.filter(call => call.request.methodName === "get_context")).toHaveLength(1);
  });

  it.each([false, true])("does not carry a locally rejected render prompt into the next Personal Chat (prior exchange: %s)", async priorExchange => {
    const calls = mockDoor({ ...catalog([provider], [record]), ...reads,
      apply_catalog_model_binding: () => envelope("apply_catalog_model_binding", applyResult()), Chat: reply });
    const adapter = await connectDoorChatAdapter(config);
    const session = new ChatSession();
    const runtime: ChatRuntime = {
      adapter, scopeKey: "personal", route: selection, modelLabel: "Chosen model", setCanvas: vi.fn(),
      context: {
        session_id: "session", mode: "personal", project_id: null,
        memory_namespace: "session/session/personal/main", read_only: false,
        effective_capabilities: [], allowed_agents: [], selected_agent: null,
      },
    };
    session.configure(runtime);
    if (priorExchange) {
      await adapter.selectRoute(selection);
      await session.submit("Earlier question");
      await expect(adapter.selectRoute({ ...selection, modelId: "missing" })).rejects.toThrow("not available");
    }
    const before = calls.filter(call => call.request.methodName === "Chat").length;
    const rejected = "rerender page with ui elements from catalog";
    await session.submit(rejected);
    expect(calls.filter(call => call.request.methodName === "Chat")).toHaveLength(before);
    expect(session.current.messages.at(-2)?.content).toBe(rejected);
    expect(session.current.messages.at(-1)?.content).toBe("Apply an available catalog model with a confirmed threetched routing binding before sending a chat message.");
    expect(session.current.draft).toBe(rejected);
    await adapter.selectRoute(selection);
    await session.submit("hi");
    expect(wire(calls)).toMatchObject({
      message: expect.stringMatching(/\n\nUser request:\nhi$/), provider: record.native_provider_id, model: selection.modelId,
      messages: [
        ...(priorExchange ? [{ role: "user", content: "Earlier question" }, { role: "assistant", content: "answer" }] : []),
        { role: "user", content: expect.stringMatching(/\n\nUser request:\nhi$/) },
      ],
    });
    expect(calls.filter(call => call.request.methodName === "Chat")).toHaveLength(before + 1);
    expect(calls.filter(call => call.request.methodName === "Chat").at(-1)?.request.capabilityId).toBe(TCHED_ROUTER_METHODS.Chat);
    session.dispose();
  });

  it("keeps an unknown Chat outcome visible without forwarding it or retrying on the next turn", async () => {
    const detail = "method_outcome_unknown; operation_id=12b52490-a40c-480a-9769-5bee2b4af58c; do not retry automatically";
    let generations = 0;
    const calls = mockDoor({ ...catalog([provider], [record]), ...reads,
      apply_catalog_model_binding: () => envelope("apply_catalog_model_binding", applyResult()),
      Chat: () => ++generations === 1
        ? { success: false, eventId: "0", eventHash: "", error: { code: ErrorCode.VALIDATION_FAILED, message: detail } }
        : reply(),
    });
    const adapter = await connectDoorChatAdapter(config);
    await adapter.selectRoute(selection);
    const session = new ChatSession();
    session.configure({
      adapter, scopeKey: "personal", route: selection, modelLabel: "Chosen model", setCanvas: vi.fn(),
      context: {
        session_id: "session", mode: "personal", project_id: null,
        memory_namespace: "session/session/personal/main", read_only: false,
        effective_capabilities: [], allowed_agents: [], selected_agent: null,
      },
    });
    await session.submit("Uncertain request");
    expect(session.current.messages.at(-1)?.content).toBe(`⚠️ Chat outcome unknown: ${detail}`);
    expect(session.current.draft).toBe("Uncertain request");
    expect(generations).toBe(1);
    await session.submit("hi");
    expect(wire(calls)).toMatchObject({ message: expect.stringMatching(/\n\nUser request:\nhi$/), messages: [{ role: "user", content: expect.stringMatching(/\n\nUser request:\nhi$/) }] });
    expect(generations).toBe(2);
    session.dispose();
=======
  const submitted = (calls: Recorded[]) => Value.toJson(calls.filter(call => call.request.methodName === "submit_turn").at(-1)!.request.arguments[0]);

  it.each(["personal", "project", "notebook_lm", "control_plane", "accountability", "ui_render"] as const)(
    "submits %s through chat_response without a model-picker binding or config-path reads",
    async mode => {
      const calls = mockDoor({ ...catalog([provider], [record]), ...chatResponseHandlers("answer") });
      const adapter = await connectDoorChatAdapter(config);
      const before = calls.length;
      await expectCommittedResponse(() => adapter.submit({
        message: "use the selected context", history: [], route: { providerId: "", modelId: "" }, mode,
      }), calls);
      expect(calls.slice(before).map(call => call.request.methodName)).toEqual([
        "start_conversation", "submit_turn", "get_turn_response",
      ]);
      expect(submitted(calls)).toEqual({
        conversation_id: "11111111-1111-7111-8111-111111111111",
        message: "use the selected context", response_mode: mode === "ui_render" ? "application" : "text",
      });
      expect(calls.slice(before).every(call => call.meta[OIA1_HEADER] === config.identity.assertion)).toBe(true);
    },
  );

  it("preserves Notebook admission failures from chat_response without changing routes or retrying", async () => {
    const calls = mockDoor({
      ...catalog([provider], [record]), ...chatResponseHandlers("answer"),
      submit_turn: () => ({
        success: false, eventId: "0", eventHash: "",
        error: { code: ErrorCode.PERMISSION_DENIED, message: "notebook scope is not granted" },
      }),
    });
    const adapter = await connectDoorChatAdapter(config);
    const before = calls.length;
    const response = await adapter.submit({ message: "notebook question", history: [], route: selection, mode: "notebook_lm" });
    expect(response.message.content).toContain("notebook scope is not granted");
    expect(calls.slice(before).map(call => call.request.methodName)).toEqual(["start_conversation", "submit_turn"]);
  });

  it("does not display a committed reply after the caller identity changes in flight", async () => {
    const replies = chatResponseHandlers("answer");
    let finish: (() => void) | undefined;
    const calls = mockDoor({
      ...catalog([provider], [record]), ...replies,
      get_turn_response: () => new Promise(resolve => {
        finish = () => resolve(replies.get_turn_response());
      }),
    });
    const adapter = await connectDoorChatAdapter(config);
    const pending = adapter.submit({ message: "notebook question", history: [], route: selection, mode: "notebook_lm" });
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    adapter.setIdentity({ kind: "oia1", assertion: "RUZHSA==" });
    finish!();
    expect((await pending).message.content).toContain("Chat context changed while awaiting a committed reply");
    expect(calls.filter(call => call.request.methodName === "submit_turn")).toHaveLength(1);
>>>>>>> Stashed changes
  });

  it("applies a receiver-verified OpenAI subscription binding without an API endpoint", async () => {
    const subscription = { ...applyResult("openai.personal"), uri: "", oauth: true };
    const calls = mockDoor({ ...catalog([provider], [record]),
      resolve_catalog_model_binding: () => envelope("resolve_catalog_model_binding", subscription),
      apply_catalog_model_binding: () => envelope("apply_catalog_model_binding", subscription), ...chatReply,
    });
    const adapter = await connectDoorChatAdapter(config);
    await expect(adapter.selectRoute(selection)).resolves.toEqual(selection);
    await adapter.submit({ message: "subscription", history: [], route: selection, mode: "personal" });
    expect(submitted(calls)).toMatchObject({ message: "subscription", response_mode: "text" });
    expect(submitted(calls)).not.toHaveProperty("provider");
    expect(submitted(calls)).not.toHaveProperty("model");
    expect(calls.some(call => call.request.methodName === "config_set" || call.request.methodName === "Chat")).toBe(false);
  });

  it.each([
    { uri: "", oauth: false },
    { uri: "", oauth: "true" },
    { uri: "", oauth: true, reference: "anthropic.personal" },
    { uri: "https://untrusted.example/v1", oauth: true },
  ])("leaves malformed subscription receipts unapplied without retry or Chat %#", async (invalid) => {
    const calls = mockDoor({ ...catalog([provider], [record]),
      apply_catalog_model_binding: () => envelope("apply_catalog_model_binding", { ...applyResult("openai.personal"), ...invalid }),
      ...chatReply,
    });
    const adapter = await connectDoorChatAdapter(config);
    await expect(adapter.selectRoute(selection)).rejects.toThrow();
    expect(calls.filter(call => call.request.methodName === "apply_catalog_model_binding")).toHaveLength(1);
    await expectCommittedResponse(() => adapter.submit({ message: "unconfirmed", history: [], route: selection, mode: "personal" }), calls);
  });

  it("applies the exact model binding and retains Cozo IDs from canonical readback", async () => {
    const selected_provider = "dynamic-family.exact_alias";
    let currentMode: ChatMode = "personal";
    const calls = mockDoor({
      ...catalog([provider], [record]),
      ...reads,
      apply_catalog_model_binding: args => {
        expect(args).toEqual({ provider_id: selection.providerId, model_id: selection.modelId });
        return envelope("apply_catalog_model_binding", applyResult(selected_provider));
<<<<<<< Updated upstream
      }, Chat: reply,
    }, () => currentMode);
=======
      }, ...chatReply,
    });
>>>>>>> Stashed changes
    const adapter = await connectDoorChatAdapter(config);
    expect(adapter.providers[0].id).toBe(selection.providerId);
    await expectCommittedResponse(() => adapter.submit({ message: "before apply", history: [], route: selection, mode: "personal" }), calls);
    expect(await adapter.selectRoute(selection)).toEqual(selection);
    await adapter.submit({ message: "after apply", history: [], route: selection, mode: "personal" });
    expect(submitted(calls)).toMatchObject({ message: "after apply", response_mode: "text" });
    expect(submitted(calls)).not.toHaveProperty("provider");
    expect(submitted(calls)).not.toHaveProperty("model");
    expect(calls.some(call => call.request.methodName === "SetSelection" || call.request.methodName === "config_set" || call.request.methodName === "config_get" || call.request.methodName === "Chat")).toBe(false);
    for (const mode of ["control_plane", "accountability"] as const) {
      currentMode = mode;
      await adapter.submit({ message: "singleton", history: [], route: selection, mode });
      expect(submitted(calls)).toMatchObject({ message: "singleton", response_mode: "text" });
      expect(submitted(calls)).not.toHaveProperty("provider");
      expect(submitted(calls)).not.toHaveProperty("model");
    }
<<<<<<< Updated upstream
    currentMode = "personal";
    await expectNoGeneration(adapter.submit({ message: "different draft", history: [], route: { ...selection, modelId: "another" }, mode: "personal" }), calls);
=======
    await expectCommittedResponse(() => adapter.submit({ message: "different draft", history: [], route: { ...selection, modelId: "another" }, mode: "personal" }), calls);
>>>>>>> Stashed changes
  });

  it("resolves an exact runtime profile when the catalog static binding is absent", async () => {
    const model = { ...record, native_provider_id: null };
    const calls = mockDoor({ ...catalog([provider], [model]), ...reads, apply_catalog_model_binding: () => envelope("apply_catalog_model_binding", applyResult()), ...chatReply });
    const adapter = await connectDoorChatAdapter(config);
    expect(adapter.providers[0].models[0].id).toBe(selection.modelId);
    await expect(adapter.selectRoute(selection)).resolves.toEqual(selection);
    const resolves = calls.filter(call => call.request.methodName === "resolve_catalog_model_binding");
    expect(resolves).toHaveLength(1);
    expect(resolves[0].request).toMatchObject({ pluginId: "chat_router", capabilityId: TCHED_ROUTER_METHODS.ResolveCatalogModelBinding });
    expect(Value.toJson(resolves[0].request.arguments[0])).toEqual({ provider_id: selection.providerId, model_id: selection.modelId });
    const apply = calls.find(call => call.request.methodName === "apply_catalog_model_binding")!;
    expect(apply.request).toMatchObject({ pluginId: "chat_router", capabilityId: TCHED_ROUTER_METHODS.ApplyCatalogModelBinding });
    expect(Value.toJson(apply.request.arguments[0])).toEqual({ provider_id: selection.providerId, model_id: selection.modelId });
  });

  it.each([
    { result: { provider_id: "wrong", model_id: selection.modelId, reference: "dynamic-family.exact_alias", model: selection.modelId, uri: inferenceUri, catalog_revision: 17 }, error: "different catalog provider or model" },
    { result: { provider_id: selection.providerId, model_id: selection.modelId, reference: "dynamic-family.exact_alias", model: "wrong", uri: inferenceUri, catalog_revision: 17 }, error: "differs from the selected catalog model" },
    { result: { provider_id: selection.providerId, model_id: selection.modelId, reference: "dynamic-family.exact_alias", model: selection.modelId, uri: "https://inference.example/other", catalog_revision: 17 }, error: "does not match" },
    { result: { provider_id: selection.providerId, model_id: selection.modelId, reference: "dynamic-family.alias.extra", model: selection.modelId, uri: inferenceUri, catalog_revision: 17 }, error: "invalid native routing binding" },
    { result: { provider_id: selection.providerId, model_id: selection.modelId, reference: "dynamic-family.exact_alias", model: selection.modelId, uri: "https://u:p@inference.example/subscription/v1", catalog_revision: 17 }, error: "credential-free HTTPS" },
  ])("rejects unsafe or mismatched reflected binding", async ({ result, error }) => {
    const calls = mockDoor({ ...catalog([provider], [record]), apply_catalog_model_binding: () => envelope("apply_catalog_model_binding", applyResult()), resolve_catalog_model_binding: () => envelope("resolve_catalog_model_binding", result) });
    const adapter = await connectDoorChatAdapter(config);
    await expect(adapter.selectRoute(selection)).rejects.toThrow(error);
    expect(calls.filter(call => call.request.methodName === "apply_catalog_model_binding")).toHaveLength(1);
    expect(calls.some(call => call.request.methodName === "SetSelection" || call.request.methodName === "config_set")).toBe(false);
    expect(calls.some(call => call.request.methodName === "submit_turn" || call.request.methodName === "Chat")).toBe(false);
  });

  it("does not confirm Apply if the reflected binding changes during readback", async () => {
    const calls = mockDoor({ ...catalog([provider], [record]), ...reads, resolve_catalog_model_binding: args => {
      const request = args as { provider_id: string; model_id: string };
      return envelope("resolve_catalog_model_binding", { provider_id: request.provider_id, model_id: request.model_id, reference: "dynamic-family.changed_alias", model: request.model_id, uri: inferenceUri, catalog_revision: 17 });
    }, apply_catalog_model_binding: () => envelope("apply_catalog_model_binding", applyResult()), ...chatReply });
    const adapter = await connectDoorChatAdapter(config);
    await expect(adapter.selectRoute(selection)).rejects.toThrow("binding changed during Apply");
    await expectCommittedResponse(() => adapter.submit({ message: "no confirmation", history: [], route: selection, mode: "personal" }), calls);
    expect(calls.filter(call => call.request.methodName === "apply_catalog_model_binding")).toHaveLength(1);
  });

  it("leaves selection validation to chat_response instead of re-reading browser bindings", async () => {
    let count = 0;
    const calls = mockDoor({ ...catalog([provider], [record]), ...reads, resolve_catalog_model_binding: args => {
      const request = args as { provider_id: string; model_id: string };
      count += 1;
      return envelope("resolve_catalog_model_binding", { provider_id: request.provider_id, model_id: request.model_id, reference: count < 2 ? "dynamic-family.exact_alias" : "dynamic-family.changed_alias", model: request.model_id, uri: inferenceUri, catalog_revision: 17 });
    }, apply_catalog_model_binding: () => envelope("apply_catalog_model_binding", applyResult()), ...chatReply });
    const adapter = await connectDoorChatAdapter(config);
    await adapter.selectRoute(selection);
    await expectCommittedResponse(() => adapter.submit({ message: "binding drift", history: [], route: selection, mode: "personal" }), calls);
    expect(count).toBe(1);
    expect(calls.filter(call => call.request.methodName === "submit_turn")).toHaveLength(1);
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
    { result: applyResult("dynamic-family.other_alias"), message: "binding changed during Apply" },
    { result: applyResult("different-family.exact_alias"), message: "binding changed during Apply" },
    { result: applyResult("dynamic-family.exact_alias", "wrong-model"), message: "differs from the selected catalog model" },
    { result: { ...applyResult(), uri: "https://u:p@inference.example/subscription/v1" }, message: "credential-free HTTPS" },
  ])("rejects differing or unsafe apply readback", async ({ result, message }) => {
    const calls = mockDoor({ ...catalog([provider], [record]), ...reads, apply_catalog_model_binding: () => envelope("apply_catalog_model_binding", result), ...chatReply });
    const adapter = await connectDoorChatAdapter(config);
    await expect(adapter.selectRoute(selection)).rejects.toThrow(message);
    await expectCommittedResponse(() => adapter.submit({ message: "no confirmed route", history: [], route: selection, mode: "personal" }), calls);
    expect(calls.some(call => call.request.methodName === "SetSelection" || call.request.methodName === "config_set")).toBe(false);
  });

  it("keeps model-picker refreshes and failed Apply separate from chat admission", async () => {
    const records = [{ ...record }];
    const calls = mockDoor({ ...catalog([provider], records), ...reads, apply_catalog_model_binding: () => envelope("apply_catalog_model_binding", applyResult()), ...chatReply });
    const adapter = await connectDoorChatAdapter(config);
    await adapter.selectRoute(selection);
    records[0].native_provider_id = "new-family.different_alias";
    await adapter.refreshProviders!();
    await adapter.submit({ message: "retain applied binding", history: [], route: selection, mode: "personal" });
    expect(submitted(calls)).toMatchObject({ message: "retain applied binding", response_mode: "text" });
    const resolves = calls.filter(call => call.request.methodName === "resolve_catalog_model_binding");
    expect(resolves).toHaveLength(1);
    await expect(adapter.selectRoute({ ...selection, modelId: "missing" })).rejects.toThrow("not available");
    await expectCommittedResponse(() => adapter.submit({ message: "failed attempt cleared assertion", history: [], route: selection, mode: "personal" }), calls);
  });

<<<<<<< Updated upstream
  it("stops provider selection at a schema-read denial without applying or logging in", async () => {
    const calls = mockDoor({ ...catalog([provider], [record]), ...reads,
      schema_read: () => ({ success: false, eventId: "0", eventHash: "", error: { code: ErrorCode.PERMISSION_DENIED, message: "guide capability denied" } }),
    });
    const adapter = await connectDoorChatAdapter(config);
    await expect(adapter.selectRoute(selection)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(calls.some(call => ["apply_catalog_model_binding", "Chat", "auth_login"].includes(call.request.methodName))).toBe(false);
  });

  it("invalidates a successful capture on identity replacement", async () => {
    const calls = mockDoor({ ...catalog([provider], [record]), ...reads, apply_catalog_model_binding: () => envelope("apply_catalog_model_binding", applyResult()), Chat: reply });
=======
  it("submits with the new identity without carrying a previous model binding", async () => {
    const calls = mockDoor({ ...catalog([provider], [record]), ...reads, apply_catalog_model_binding: () => envelope("apply_catalog_model_binding", applyResult()), ...chatReply });
>>>>>>> Stashed changes
    const adapter = await connectDoorChatAdapter(config);
    await adapter.selectRoute(selection);
    adapter.setIdentity({ kind: "oia1", assertion: "RUZHSA==" });
    await expectCommittedResponse(() => adapter.submit({ message: "new identity", history: [], route: selection, mode: "personal" }), calls);
    expect(calls.filter(call => call.request.methodName === "submit_turn").at(-1)?.meta[OIA1_HEADER]).toBe("RUZHSA==");
  });

  it("rejects a server-side mode change before calling Chat", async () => {
    let currentMode: ChatMode = "personal";
    const calls = mockDoor({ ...catalog([provider], [record]), ...reads,
      apply_catalog_model_binding: () => envelope("apply_catalog_model_binding", applyResult()), Chat: reply,
    }, () => currentMode);
    const adapter = await connectDoorChatAdapter(config);
    await adapter.selectRoute(selection);
    currentMode = "project";
    const response = await adapter.submit({ message: "stale personal request", history: [], route: selection, mode: "personal" });
    expect(response.message.content).toContain("Chat mode changed from personal to project");
    expect(response.historyEligible).toBe(false);
    expect(calls.some(call => call.request.methodName === "Chat")).toBe(false);
  });

  it("surfaces a sealed docs denial without falling back to prompt-only guesses", async () => {
    const calls = mockDoor({ ...catalog([provider], [record]), ...reads,
      apply_catalog_model_binding: () => envelope("apply_catalog_model_binding", applyResult()),
      schema_read: args => (args as { plugin_id: string }).plugin_id === "json_render"
        ? { success: false, eventId: "0", eventHash: "", error: { code: ErrorCode.PERMISSION_DENIED, message: "sealed UI docs denied" } }
        : envelope("schema_read", { plugin_id: "model_registry", schema_hash: "a".repeat(64), schema: { name: "model_registry", description: "[chatbot-guide:v1] fixture provider guide" } }),
    });
    const adapter = await connectDoorChatAdapter(config);
    await adapter.selectRoute(selection);
    const response = await adapter.submit({ message: "do not invent docs", history: [], route: selection, mode: "personal" });
    expect(response.historyEligible).toBe(false);
    // The door shows a user-safe denial; the server's detail stays out of the chat.
    expect(response.message.content).toBe("⚠️ Chat unavailable: This identity does not hold the capability for that operation.");
    expect(calls.some(call => call.request.methodName === "Chat")).toBe(false);
    const docsRead = calls.find(call => call.request.methodName === "schema_read" && (Value.toJson(call.request.arguments[0]) as { plugin_id: string }).plugin_id === "json_render");
    expect(docsRead?.meta["x-opdbus-capability"]).toBe("cognitive_mcp.read");
  });

  it("stops before Chat when the authoritative context read is denied", async () => {
    const calls = mockDoor({ ...catalog([provider], [record]), ...reads,
      apply_catalog_model_binding: () => envelope("apply_catalog_model_binding", applyResult()),
      get_context: () => ({ success: false, eventId: "0", eventHash: "", error: { code: ErrorCode.PERMISSION_DENIED, message: "chat context denied" } }),
    });
    const adapter = await connectDoorChatAdapter(config);
    await adapter.selectRoute(selection);
    const response = await adapter.submit({ message: "no context", history: [], route: selection, mode: "personal" });
    expect(response.historyEligible).toBe(false);
    expect(response.message.content).toBe("⚠️ Chat unavailable: This identity does not hold the capability for that operation.");
    expect(calls.some(call => call.request.methodName === "Chat")).toBe(false);
    const contextRead = calls.find(call => call.request.methodName === "get_context");
    expect(contextRead?.meta["x-opdbus-capability"]).toBe("chat.context");
  });

  it("does not send Chat when identity changes during the sealed docs read", async () => {
    let finish!: (response: CallMethodResponse) => void;
    const calls = mockDoor({ ...catalog([provider], [record]), ...reads,
      apply_catalog_model_binding: () => envelope("apply_catalog_model_binding", applyResult()),
      schema_read: args => (args as { plugin_id: string }).plugin_id === "json_render"
        ? new Promise(resolve => { finish = resolve; })
        : envelope("schema_read", { plugin_id: "model_registry", schema_hash: "a".repeat(64), schema: { name: "model_registry", description: "[chatbot-guide:v1] fixture provider guide" } }),
      Chat: reply,
    });
    const adapter = await connectDoorChatAdapter(config);
    await adapter.selectRoute(selection);
    const pending = adapter.submit({ message: "identity rotates", history: [], route: selection, mode: "personal" });
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    adapter.setIdentity({ kind: "oia1", assertion: "RUZHSA==" });
    finish(envelope("schema_read", {
      plugin_id: "json_render", schema_hash: "d".repeat(64),
      schema: { name: "json_render", fields: { ui_authoring: { default: fixtureUiAuthoring } } },
    }));
    const response = await pending;
    expect(response.historyEligible).toBe(false);
    expect(calls.some(call => call.request.methodName === "Chat")).toBe(false);
  });

  it("does not capture a late Apply response after identity replacement", async () => {
    let finish!: (response: CallMethodResponse) => void;
    const calls = mockDoor({ ...catalog([provider], [record]), ...reads, apply_catalog_model_binding: () => new Promise(resolve => { finish = resolve; }), ...chatReply });
    const adapter = await connectDoorChatAdapter(config);
    const applying = adapter.selectRoute(selection);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    adapter.setIdentity({ kind: "oia1", assertion: "RUZHSA==" });
    finish(envelope("apply_catalog_model_binding", applyResult()));
    await expect(applying).rejects.toThrow("context changed");
    await expectCommittedResponse(() => adapter.submit({ message: "no stale assertion", history: [], route: selection, mode: "personal" }), calls);
  });

  it("does not confirm or repeat Apply after readback returns to a stale identity", async () => {
    let finish!: (response: CallMethodResponse) => void;
    const calls = mockDoor({ ...catalog([provider], [record]), apply_catalog_model_binding: () => envelope("apply_catalog_model_binding", applyResult()), resolve_catalog_model_binding: args => new Promise(resolve => {
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
    expect(calls.filter(call => call.request.methodName === "apply_catalog_model_binding")).toHaveLength(1);
    expect(calls.some(call => call.request.methodName === "SetSelection" || call.request.methodName === "config_set")).toBe(false);
  });

  it("keeps failed protected selection separate from chat admission", async () => {
    const calls = mockDoor({ ...catalog([provider], [record]), ...reads, apply_catalog_model_binding: () => envelope("apply_catalog_model_binding", applyResult()), ...chatReply });
    const adapter = await connectDoorChatAdapter(config);
    await adapter.selectRoute(selection);
    await expect(adapter.controlPlane.set({ ...selection, modelId: "missing" }, vi.fn())).rejects.toThrow();
    await expectCommittedResponse(() => adapter.submit({ message: "server route", history: [], route: selection, mode: "personal" }), calls);
  });

  it("reports the actual chat_response error without unrelated canned suggestions", async () => {
    mockDoor({
      ...catalog([provider], [record]), ...reads,
      apply_catalog_model_binding: () => envelope("apply_catalog_model_binding", applyResult()),
      start_conversation: () => ({ success: false, eventId: "0", eventHash: "", error: { code: ErrorCode.VALIDATION_FAILED, message: "native route unavailable" } }),
    });
    const adapter = await connectDoorChatAdapter(config);
    await adapter.selectRoute(selection);
    const response = await adapter.submit({ message: "hi", history: [], route: selection, mode: "personal" });
    expect(response.message.content).toBe("⚠️ Chat unavailable: native route unavailable");
    expect(response.historyEligible).toBe(false);
  });

  it("labels an admitted submit_turn with an unknown outcome without retrying it", async () => {
    const detail = "method_outcome_unknown; operation_id=12b52490-a40c-480a-9769-5bee2b4af58c; do not retry automatically";
    const calls = mockDoor({
      ...catalog([provider], [record]), ...reads,
      apply_catalog_model_binding: () => envelope("apply_catalog_model_binding", applyResult()),
      start_conversation: () => envelope("start_conversation", { conversation_id: "11111111-1111-7111-8111-111111111111", started_at: "2026-10-24T00:00:00Z" }, "chat_response"),
      submit_turn: () => ({ success: false, eventId: "0", eventHash: "", error: { code: ErrorCode.VALIDATION_FAILED, message: detail } }),
    });
    const adapter = await connectDoorChatAdapter(config);
    await adapter.selectRoute(selection);
    const response = await adapter.submit({ message: "hi", history: [], route: selection, mode: "personal" });
    expect(response.message.content).toBe(`⚠️ Chat outcome unknown: ${detail}`);
<<<<<<< Updated upstream
    expect(response.historyEligible).toBe(false);
    expect(calls.filter((call) => call.request.methodName === "Chat")).toHaveLength(1);
=======
    expect(calls.filter((call) => call.request.methodName === "submit_turn")).toHaveLength(1);
    expect(calls.some((call) => call.request.methodName === "Chat")).toBe(false);
>>>>>>> Stashed changes
  });
});

describe("connectDoorChatAdapter", () => {
  it("returns stored choices before a background refresh and coalesces an explicit refresh with it", async () => {
    const records = [{ provider_id: "vendor", model_id: "stored", available: true }];
    const fixture = catalog([{ provider_id: "vendor", configured: true, enabled: true, status: "ok" }], records);
    let finish!: (response: CallMethodResponse) => void;
    const calls = mockDoor({
      ...fixture,
      refresh: () => new Promise<CallMethodResponse>(resolve => { finish = resolve; }),
    });
    const adapter = await connectDoorChatAdapter(config, { refreshOnLoad: "background" });
    expect(adapter.providers[0].models[0].id).toBe("stored");
    expect(adapter.catalogRefreshOnMount).toBe(true);
    expect(calls.map(call => call.request.methodName)).toEqual(["list_providers", "list_models", "GetState"]);
    const pending = adapter.refreshProviders!();
    expect(adapter.catalogRefreshOnMount).toBe(false);
    expect(adapter.refreshProviders!()).toBe(pending);
    expect(adapter.providers[0].models[0].id).toBe("stored");
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    records[0] = { ...records[0], model_id: "fresh" };
    finish(fixture.refresh());
    await pending;
    expect(adapter.providers[0].models[0].id).toBe("fresh");
    expect(calls.map(call => call.request.methodName)).toEqual([
      "list_providers", "list_models", "GetState", "refresh", "list_providers", "list_models",
    ]);
  });

  it("refreshes once before connection when no stored providers exist", async () => {
    const empty = catalog();
    const populated = catalog([{ provider_id: "vendor", configured: true, enabled: true, status: "ok" }],
      [{ provider_id: "vendor", model_id: "first", available: true }]);
    let refreshed = false;
    const calls = mockDoor({
      ...populated,
      list_providers: () => refreshed ? populated.list_providers() : empty.list_providers(),
      refresh: () => { refreshed = true; return populated.refresh(); },
    });
    const adapter = await connectDoorChatAdapter(config, { refreshOnLoad: "background" });
    expect(adapter.providers[0].models[0].id).toBe("first");
    expect(adapter.catalogRefreshOnMount).toBe(false);
    expect(calls.map(call => call.request.methodName)).toEqual([
      "list_providers", "refresh", "list_providers", "list_models", "GetState",
    ]);
  });

  it("retains stored choices and consumes automatic refresh after an unknown outcome", async () => {
    const detail = "method_outcome_unknown; operation_id=8e0adbef-441f-493f-a61d-a028e6dfca48; do not retry automatically";
    const calls = mockDoor({
      ...catalog([{ provider_id: "vendor", configured: true, enabled: true, status: "ok" }],
        [{ provider_id: "vendor", model_id: "stored", available: true }]),
      refresh: () => { throw new RpcError(detail, "INTERNAL"); },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const adapter = await connectDoorChatAdapter(config, { refreshOnLoad: "background" });
    await adapter.refreshProviders!();
    expect(adapter.catalogRefreshOnMount).toBe(false);
    expect(adapter.catalogError).toContain(detail);
    expect(adapter.providers[0].models[0].id).toBe("stored");
    expect(calls.filter(call => call.request.methodName === "refresh")).toHaveLength(1);
    expect(calls.some(call => ["schema_read", "Chat", "apply_catalog_model_binding"].includes(call.request.methodName))).toBe(false);
  });

  it.each(["UNAUTHENTICATED", "PERMISSION_DENIED", "CANCELLED"])(
    "does not start a background mutation when the initial catalog read is refused (%s)",
    async code => {
      const calls = mockDoor({ list_providers: () => { throw new RpcError("catalog refused", code); } });
      vi.spyOn(console, "error").mockImplementation(() => {});
      await expect(connectDoorChatAdapter(config, { refreshOnLoad: "background" })).rejects.toMatchObject({ code });
      expect(calls.map(call => call.request.methodName)).toEqual(["list_providers"]);
    },
  );

  it("preserves read-only CLI discovery when refresh on load is explicitly disabled", async () => {
    const calls = mockDoor({
      ...catalog([{ provider_id: "vendor", configured: true, enabled: true, status: "ok" }],
        [{ provider_id: "vendor", model_id: "stored", available: true }]),
    });
    const adapter = await connectDoorChatAdapter(config, { refreshOnLoad: false });
    expect(adapter.catalogRefreshOnMount).toBe(false);
    expect(adapter.providers[0].models[0].id).toBe("stored");
    expect(adapter.catalogError).toBeNull();
    expect(calls.map(call => call.request.methodName)).toEqual(["list_providers", "list_models", "GetState"]);
    await adapter.refreshProviders!();
    expect(calls.map(call => call.request.methodName)).toEqual([
      "list_providers", "list_models", "GetState", "refresh", "list_providers", "list_models",
    ]);
  });

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
    expect(calls.map(call => call.request.methodName)).toEqual(["refresh", "list_providers", "list_models", "list_models", "GetState"]);
    expect(byMethod.refresh.request).toMatchObject({
      pluginId: "model_registry", objectPath: `${PLUGIN_OBJECT_ROOT}/model_registry`,
      interfaceName: PLUGIN_INTERFACE, capabilityId: "model_registry.refresh",
    });
    expect(Value.toJson(byMethod.refresh.request.arguments[0])).toEqual({});
    expect(byMethod.refresh.meta).toEqual({
      [OIA1_HEADER]: "QUJDRA==", "x-opdbus-capability": "model_registry.refresh",
    });
    expect(byMethod.refresh.timeout).toBe(300_000);
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
    let currentMode: ChatMode = "control_plane";
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
<<<<<<< Updated upstream
      Chat: () => envelope("Chat", { content: "native route answer", provider: "custom", model: nativeModel, finish_reason: "stop", usage: {} }),
    }, () => currentMode);
=======
      ...chatResponseHandlers("native route answer"),
    });
>>>>>>> Stashed changes
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
    expect(ticketArgs).toEqual({ plugin: "chat_router", method: "config_patch", args: Value.toJson(patch.request.arguments[0]), password: "fixture-password" });
    expect(ticket.request.pluginId).toBe("elevation");
    expect(ticket.request.capabilityId).toBe("elevation.authorize");
    expect(patch.request.capabilityId).toBe("cap.software.tched-router.router.write@v1");
    expect(ticket.meta[OIA1_HEADER]).toBe(config.identity.assertion);
    expect(patch.meta[OIA1_HEADER]).toBe(config.identity.assertion);
    expect(calls.some(call => call.request.methodName === "SetSelection" || call.request.methodName === "config_set")).toBe(false);

    const ordinaryRoute = { providerId: "ordinary-provider", modelId: "ordinary-model" };
    await adapter.submit({ message: "control answer", history: [], route: ordinaryRoute, mode: "control_plane" });
<<<<<<< Updated upstream
    const cpChat = calls.filter(call => call.request.methodName === "Chat").at(-1)!;
    expect(Value.toJson(cpChat.request.arguments[0])).not.toHaveProperty("provider");
    expect(Value.toJson(cpChat.request.arguments[0])).not.toHaveProperty("model");
    currentMode = "personal";
    await expectNoGeneration(adapter.submit({ message: "personal answer", history: [], route: ordinaryRoute, mode: "personal" }), calls);
=======
    const turn = calls.filter(call => call.request.methodName === "submit_turn").at(-1)!;
    expect(turn.request.pluginId).toBe("chat_response");
    expect(turn.request.capabilityId).toBe(CHAT_RESPONSE_CAPS.Submit);
    expect(Value.toJson(turn.request.arguments[0])).not.toHaveProperty("provider");
    expect(Value.toJson(turn.request.arguments[0])).not.toHaveProperty("model");
    await expectCommittedResponse(() => adapter.submit({ message: "personal answer", history: [], route: ordinaryRoute, mode: "personal" }), calls);
>>>>>>> Stashed changes
  });

  it("preserves the authenticated caller when applying its own model without administration", async () => {
    const selection = { providerId: "dynamic_vendor", modelId: "next-model" };
    let nativeModel = "old-model";
    const records = ["next-model", "old-model"].map(model_id => ({
      provider_id: selection.providerId, model_id, available: true,
      control_plane_profile: "custom.control_plane", inference_url_prefix: inferencePrefix,
    }));
    const calls = mockDoor({
      ...catalog([{ provider_id: selection.providerId, configured: true, enabled: true }], records),
      get_own_agent_route_access: () => envelope("get_own_agent_route_access", { can_apply: true }),
      get_own_agent_route: () => envelope("get_own_agent_route", {
        mode: "control_plane", reference: "custom.control_plane", model: nativeModel, uri: inferenceUri,
      }),
      apply_own_agent_route: args => {
        expect(args).toEqual({ provider_id: selection.providerId, model_id: selection.modelId });
        nativeModel = selection.modelId;
        return envelope("apply_own_agent_route", {
          mode: "control_plane", reference: "custom.control_plane", model: nativeModel, uri: inferenceUri,
        });
      },
    });
    const adapter = await connectDoorChatAdapter(config);
    expect(await adapter.controlPlane.access()).toBe("self");
    const elevate = vi.fn();
    await adapter.controlPlane.set(selection, elevate);
    expect(await adapter.controlPlane.current()).toEqual(selection);
    expect(elevate).not.toHaveBeenCalled();
    expect(calls.some(call => ["config_get", "config_patch", "authorize_task"].includes(call.request.methodName))).toBe(false);
    const mutation = calls.find(call => call.request.methodName === "apply_own_agent_route")!;
    expect(mutation.request.capabilityId).toBe("cap.software.tched-router.agent.route.self.write@v1");
    expect(mutation.meta[OIA1_HEADER]).toBe(config.identity.assertion);
  });

  it("commits the route through the scoped catalog operation and displays only a committed chat_response turn", async () => {
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
      ...chatResponseHandlers("hello from the chatbot"),
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

    expect(response.message).toEqual({ id: "door-33333333-3333-7333-8333-333333333333", role: "agent", content: "hello from the chatbot" });
    expect(response.canvasSpec).toBeUndefined();

<<<<<<< Updated upstream
    const chat = calls.find((call) => call.request.methodName === "Chat")!;
    expect(chat.request.capabilityId).toBe(TCHED_ROUTER_METHODS.Chat);
    const args = Value.toJson(chat.request.arguments[0]) as { message: string; messages: { role: string; content: string }[]; provider: string; model: string };
    expect(args.message).toContain("fixture provider guide");
    expect(args.message).toMatch(/\n\nUser request:\nhi$/);
    expect(args.messages).toEqual([
      { role: "assistant", content: "earlier reply" },
      { role: "user", content: args.message },
    ]);
    expect({ provider: args.provider, model: args.model }).toEqual({ provider: "local.demo_route", model: "gemma" });
=======
    expect(calls.some((call) => call.request.methodName === "Chat" || call.request.methodName === "generate_spec")).toBe(false);
    const start = calls.find((call) => call.request.methodName === "start_conversation")!;
    expect(start.request).toMatchObject({ pluginId: "chat_response", capabilityId: CHAT_RESPONSE_CAPS.Read, methodName: CHAT_RESPONSE_METHODS.StartConversation });
    const chat = calls.find((call) => call.request.methodName === "submit_turn")!;
    expect(chat.request).toMatchObject({ pluginId: "chat_response", capabilityId: CHAT_RESPONSE_CAPS.Submit });
    const args = Value.toJson(chat.request.arguments[0]) as { message: string; conversation_id: string; response_mode: string; provider?: string; model?: string; messages?: unknown };
    expect(args).toEqual({
      conversation_id: "11111111-1111-7111-8111-111111111111",
      message: "hi",
      response_mode: "text",
    });
    expect(args.messages).toBeUndefined();
    expect(args.provider).toBeUndefined();
    expect(args.model).toBeUndefined();
    expect(calls.some((call) => call.request.methodName === "get_turn_response")).toBe(true);
>>>>>>> Stashed changes
  });

  it("does not send the personal provider or model in Control Plane mode", async () => {
    const calls = mockDoor({
      ...catalog([
        { provider_id: "openrouter", name: "OpenRouter", configured: true, enabled: true, status: "ok", control_plane_profiles: [] },
      ], [{ provider_id: "openrouter", model_id: "gemma", available: true, control_plane_profile: "custom.cp_route", inference_url_prefix: inferencePrefix }]),
      ...nativeReads({ "agents.control_plane.model_provider": "custom.cp_route", "providers.models.custom.cp_route.model": "gemma", "providers.models.custom.cp_route.uri": inferenceUri }),
      GetState: () => envelope("GetState", { state: { status: "active", selected_provider: "local", selected_model: "gemma", providers: [{ id: "local", kind: "local", description: "", aliases: [] }], model_routes: [{ provider: "local", model: "gemma", hint: "", kind: "chat", available: true, status: "", status_reason: "" }] } }),
<<<<<<< Updated upstream
      Chat: () => envelope("Chat", { content: "control plane reply", provider: "", model: "", finish_reason: "stop", usage: {} }),
    }, "control_plane");
    const adapter = await connectDoorChatAdapter(config);
    await adapter.submit({ message: "status", history: [], route: { providerId: "local", modelId: "gemma" }, mode: "control_plane" });
    const chat = calls.find((call) => call.request.methodName === "Chat")!;
    const args = Value.toJson(chat.request.arguments[0]) as { message: string; messages: { role: string; content: string }[]; provider?: string; model?: string };
    expect(args.message).toContain("Answer the user's request normally");
    expect(args.message).toContain("catalogComponent");
    expect(args.message).not.toContain("dashboardTable");
    expect(args.messages).toEqual([{ role: "user", content: args.message }]);
=======
      ...chatResponseHandlers("control plane reply"),
    });
    const adapter = await connectDoorChatAdapter(config);
    await adapter.submit({ message: "status", history: [], route: { providerId: "local", modelId: "gemma" }, mode: "control_plane" });
    const chat = calls.find((call) => call.request.methodName === "submit_turn")!;
    const args = Value.toJson(chat.request.arguments[0]) as { message: string; response_mode: string; provider?: string; model?: string; messages?: unknown };
    expect(args).toMatchObject({ message: "status", response_mode: "text" });
    expect(args.messages).toBeUndefined();
>>>>>>> Stashed changes
    expect(args.provider).toBeUndefined();
    expect(args.model).toBeUndefined();
    expect(calls.some((call) => call.request.methodName === "SetSelection" || call.request.methodName === "Chat")).toBe(false);
  });

  it("surfaces a bridge refusal as a DoorError, never as empty data", async () => {
    mockDoor({
      ...catalog(),
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

  it("keeps admitted catalog choices when global router state is denied without claiming an applied route", async () => {
    const calls = mockDoor({
      ...catalog(
        [{ provider_id: "vendor", configured: true, enabled: true, status: "ok" }],
        [{ provider_id: "vendor", model_id: "model", available: true }],
      ),
      GetState: () => ({
        success: false,
        result: undefined,
        eventId: "0",
        eventHash: "",
        error: { code: ErrorCode.PERMISSION_DENIED, message: "global router state capability not held" },
      }),
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const adapter = await connectDoorChatAdapter(config);
    expect(adapter.providers[0].id).toBe("vendor");
    expect(adapter.providers[0].models[0].id).toBe("model");
    expect(adapter.committedRoute).toBeNull();
    expect(adapter.routeInitiallyApplied).toBe(false);
    expect(calls.map(call => call.request.methodName)).toEqual(["refresh", "list_providers", "list_models", "GetState"]);
  });

  it("keeps successful and stored choices with a warning after a partial refresh", async () => {
    const calls = mockDoor({
      ...catalog([
        { provider_id: "fresh", configured: true, enabled: true, status: "ok" },
        { provider_id: "stored", configured: true, enabled: true, status: "error" },
      ], [
        { provider_id: "fresh", model_id: "new", available: true },
        { provider_id: "stored", model_id: "previous", available: true },
      ]),
      refresh: () => envelope("refresh", {
        refreshed_at: "2026-10-11T14:36:00Z", revision: 1,
        providers: [
          { provider_id: "fresh", status: "ok", available_models: 0, added: 0, dropped: 0 },
          { provider_id: "stored", status: "error", available_models: 0, added: 0, dropped: 0 },
        ],
      }),
    });
    const adapter = await connectDoorChatAdapter(config);
    expect(adapter.providers.map(provider => [provider.id, provider.models.map(model => model.id)])).toEqual([
      ["fresh", ["new"]], ["stored", ["previous"]],
    ]);
    expect(adapter.catalogError).toBe("Could not refresh stored. Showing stored models for those providers.");
    expect(adapter.committedRoute).toBeNull();
    expect(adapter.routeInitiallyApplied).toBe(false);
    expect(calls.map(call => call.request.methodName)).toEqual(["refresh", "list_providers", "list_models", "list_models", "GetState"]);
  });

  it.each([
    { code: "PERMISSION_DENIED", detail: "refresh capability not held", warning: "freshness is unconfirmed" },
    { code: "INTERNAL", detail: "method_outcome_unknown; operation_id=8e0adbef-441f-493f-a61d-a028e6dfca48; do not retry automatically", warning: "operation_id=8e0adbef-441f-493f-a61d-a028e6dfca48" },
  ])("keeps readable picker data after refresh $code without replay or selection", async ({ code, detail, warning }) => {
    const calls = mockDoor({
      ...catalog([{ provider_id: "vendor", configured: true, enabled: true, status: "ok" }],
        [{ provider_id: "vendor", model_id: "stored", available: true }]),
      refresh: () => { throw new RpcError(detail, code); },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const adapter = await connectDoorChatAdapter(config);
    expect(adapter.providers[0].models[0].id).toBe("stored");
    expect(adapter.catalogError).toContain(warning);
    expect(adapter.committedRoute).toBeNull();
    expect(adapter.routeInitiallyApplied).toBe(false);
    expect(calls.map(call => call.request.methodName)).toEqual(["refresh", "list_providers", "list_models", "GetState"]);
    for (const call of calls.filter(call => call.request.pluginId === "model_registry")) {
      expect(call.meta[OIA1_HEADER]).toBe(config.identity.assertion);
      expect(call.meta["x-opdbus-capability"]).toBe(call.request.methodName === "refresh" ? "model_registry.refresh" : "model_registry.read");
    }
  });

  it.each(["UNAUTHENTICATED", "CANCELLED"])("stops interface loading after refresh %s without catalog reads", async code => {
    const calls = mockDoor({ refresh: () => { throw new RpcError("refresh refused", code); } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(connectDoorChatAdapter(config)).rejects.toMatchObject({ code });
    expect(calls.map(call => call.request.methodName)).toEqual(["refresh"]);
  });

  it("exposes picker data and the operation ID when initial route confirmation has an unknown outcome", async () => {
    const detail = "method_outcome_unknown; operation_id=8e0adbef-441f-493f-a61d-a028e6dfca48; do not retry automatically";
    const calls = mockDoor({
      ...catalog([{ provider_id: "vendor", configured: true, enabled: true, status: "ok" }],
        [{ provider_id: "vendor", model_id: "fresh", available: true }]),
      GetState: () => { throw new RpcError(detail, "INTERNAL"); },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const adapter = await connectDoorChatAdapter(config);
    expect(adapter.providers[0].models[0].id).toBe("fresh");
    expect(adapter.committedRoute).toBeNull();
    expect(adapter.routeInitiallyApplied).toBe(false);
    expect(adapter.initialRouteError).toContain(detail);
    expect(adapter.catalogError).toBeNull();
    expect(calls.map(call => call.request.methodName)).toEqual(["refresh", "list_providers", "list_models", "GetState"]);
  });

  it.each(["UNAUTHENTICATED", "UNAVAILABLE", "CANCELLED"])(
    "keeps router-state authentication/transport/cancellation failures fatal (%s)",
    async code => {
      const calls = mockDoor({
        ...catalog([{ provider_id: "vendor", configured: true, enabled: true, status: "ok" }]),
        GetState: () => { throw new RpcError("method_outcome_unknown; operation_id=8e0adbef-441f-493f-a61d-a028e6dfca48", code); },
      });
      vi.spyOn(console, "error").mockImplementation(() => {});
      await expect(connectDoorChatAdapter(config)).rejects.toMatchObject({ code });
      expect(calls.map(call => call.request.methodName)).toEqual(["refresh", "list_providers", "list_models", "GetState"]);
    },
  );

  it("refuses a malformed credential before contacting the door", async () => {
    const calls = mockDoor({});
    await expect(
      connectDoorChatAdapter({ url: config.url, identity: { kind: "sid1", sealedId: "not base64!" } }),
    ).rejects.toBeInstanceOf(DoorError);
    expect(calls).toHaveLength(0);
  });
});

describe("UI reference and rendering transport", () => {
<<<<<<< Updated upstream
  it.each((["personal", undefined, "control_plane", "accountability"] as const).flatMap(mode =>
    (["json-render", "spec", "raw-json", "raw-jsonl"] as const).map(format => ({ mode, format })),
  ))("offers validated catalog presentation in $mode mode from $format", async ({ mode, format }) => {
    const spec = { root: "status", elements: { status: { type: "heading", props: { text: "Example only", level: 2 } } } };
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
    }, mode ?? "personal");
    const adapter = await connectDoorChatAdapter(config);
    const route = { providerId: "openrouter", modelId: "demo" };
    const personal = mode === undefined || mode === "personal";
    if (personal) await adapter.selectRoute(route);
    const response = await adapter.submit({ message: "show status", history: [], route, mode });
    expect(response.canvasSpec).toMatchObject(spec);
    expect(response.message.content).toBe(format.startsWith("raw-") ? "Rendered the requested interface." : "Status");
    const chat = calls.find(call => call.request.methodName === "Chat")!;
    const args = Value.toJson(chat.request.arguments[0]) as { message: string; messages: { content: string }[]; provider?: string; model?: string };
    if (personal) {
      expect(args.message).toMatch(/User request:\nshow status$/);
      expect(args.messages).toEqual([{ role: "user", content: args.message }]);
    } else {
      expect(args.message).toContain("optionally include one fenced spec block per distinct interface");
      expect(args.message).toContain("catalogComponent");
      expect(args.message).not.toContain("dashboardStatus");
    }
    expect(args.message).toContain("Use the implemented Svelte catalog and registry.");
    expect(args.message).not.toContain("unselected-document-secret");
    expect(args.message).toContain("fixture provider guide");
    expect(calls.filter(call => call.request.methodName === "schema_read")).toHaveLength(2);
    expect(args.messages.at(-1)?.content).toBe(args.message);
    expect(args.provider).toBe(personal ? "custom.demo" : undefined);
    expect(args.model).toBe(personal ? "demo" : undefined);
  });

  it("supplies the implemented catalog in UI render mode and validates the returned canvas", async () => {
    const spec = { root: "status", elements: { status: { type: "heading", props: { text: "Example only", level: 2 } } } };
    const calls = mockDoor({
      ...catalog([
        { provider_id: "openrouter", name: "OpenRouter", configured: true, enabled: true, status: "ok", control_plane_profiles: [] },
      ], [{ provider_id: "openrouter", model_id: "demo", available: true, native_provider_id: "custom.demo", inference_url_prefix: inferencePrefix }]),
      resolve_catalog_model_binding: args => envelope("resolve_catalog_model_binding", { ...(args as object), reference: "custom.demo", model: "demo", uri: inferenceUri, catalog_revision: 1 }),
      ...nativeReads({ "providers.models.custom.demo.uri": inferenceUri }),
      apply_catalog_model_binding: args => envelope("apply_catalog_model_binding", { ...(args as object), reference: "custom.demo", model: "demo", uri: inferenceUri, catalog_revision: 1 }),
      GetState: () => envelope("GetState", { state: { status: "active", selected_provider: "local", selected_model: "demo", providers: [{ id: "local", kind: "local", description: "", aliases: [] }], model_routes: [{ provider: "local", model: "demo", hint: "", kind: "chat", available: true, status: "", status_reason: "" }] } }),
      Chat: () => envelope("Chat", { content: `Preview\n\`\`\`json-render\n${JSON.stringify(spec)}\n\`\`\``, provider: "local", model: "demo" }),
    }, "ui_render");
=======
  it.each(["personal", "control_plane", "accountability"] as const)(
    "displays a committed presentation canvas in $mode mode without Chat or generate_spec",
    async (mode) => {
      const spec = { root: "status", elements: { status: { type: "dashboardStatus", props: { label: "Example only", tone: "info" } } } };
      const calls = mockDoor({
        ...catalog([
          { provider_id: "openrouter", name: "OpenRouter", configured: true, enabled: true, status: "ok", control_plane_profiles: [] },
        ], [{ provider_id: "openrouter", model_id: "demo", available: true, native_provider_id: "custom.demo", control_plane_profile: "custom.cp_route", inference_url_prefix: inferencePrefix }]),
        resolve_catalog_model_binding: args => envelope("resolve_catalog_model_binding", { ...(args as object), reference: "custom.demo", model: "demo", uri: inferenceUri, catalog_revision: 1 }),
        ...nativeReads({ "providers.models.custom.demo.uri": inferenceUri, "agents.control_plane.model_provider": "custom.cp_route", "providers.models.custom.cp_route.model": "demo", "providers.models.custom.cp_route.uri": inferenceUri, "agents.accountability.model_provider": "custom.audit_route", "providers.models.custom.audit_route.model": "demo", "providers.models.custom.audit_route.uri": inferenceUri }),
        apply_catalog_model_binding: args => envelope("apply_catalog_model_binding", { ...(args as object), reference: "custom.demo", model: "demo", uri: inferenceUri, catalog_revision: 1 }),
        GetState: () => envelope("GetState", { state: { status: "active", selected_provider: "local", selected_model: "demo", providers: [{ id: "local", kind: "local", description: "", aliases: [] }], model_routes: [{ provider: "local", model: "demo", hint: "", kind: "chat", available: true, status: "", status_reason: "" }] } }),
        ...chatResponseHandlers("Status", { canvas: spec }),
      });
      const adapter = await connectDoorChatAdapter(config);
      const route = { providerId: "openrouter", modelId: "demo" };
      if (mode === "personal") await adapter.selectRoute(route);
      const response = await adapter.submit({ message: "show status", history: [], route, mode });
      expect(response.canvasSpec).toMatchObject(spec);
      expect(response.message.content).toBe("Status");
      const chat = calls.find(call => call.request.methodName === "submit_turn")!;
      expect(chat.request.pluginId).toBe("chat_response");
      expect(Value.toJson(chat.request.arguments[0])).toMatchObject({ message: "show status", response_mode: "text" });
      expect(calls.some(call => call.request.methodName === "Chat" || call.request.methodName === "generate_spec")).toBe(false);
    },
  );

  it("requests application-mode committed turns for UI Render without generate_spec or Chat", async () => {
    const spec = { root: "status", elements: { status: { type: "dashboardStatus", props: { label: "Example only", tone: "info" } } } };
    const calls = mockDoor({
      ...catalog([{ provider_id: "openrouter", configured: true, enabled: true }]),
      ...chatResponseHandlers("Preview", { canvas: spec }),
    });
>>>>>>> Stashed changes
    const adapter = await connectDoorChatAdapter(config);
    const route = { providerId: "not-applied", modelId: "not-applied" };
    const response = await adapter.submit({
      message: "show btrfs",
      history: [
        { id: "system", role: "system", content: "not caller authority" },
        { id: "previous", role: "agent", content: "A prior proposal" },
        { id: "current", role: "user", content: "show btrfs" },
      ],
      route, mode: "ui_render",
    });
    expect(response.canvasSpec).toEqual(spec);
    expect(response.message.content).toBe("Preview");
<<<<<<< Updated upstream
    const call = calls.find(call => call.request.methodName === "Chat")!;
    const args = Value.toJson(call.request.arguments[0]) as { message: string; messages: { content: string }[] };
    expect(args.message).not.toContain("Relevant static reference");
    expect(args.message).toContain("gallery for proposing possible interfaces");
    expect(args.message).toContain("Do not claim any proposal has been promoted into the main catalog");
    expect(args.message).toContain("catalogComponent");
    expect(args.message).not.toContain("dashboardTable");
    expect(args.messages.at(-1)?.content).toBe(args.message);
=======
    const call = calls.find(call => call.request.methodName === "submit_turn")!;
    expect(call.request.pluginId).toBe("chat_response");
    expect(call.request.capabilityId).toBe(CHAT_RESPONSE_CAPS.Submit);
    expect(call.meta[OIA1_HEADER]).toBe(config.identity.assertion);
    expect(Value.toJson(call.request.arguments[0])).toEqual({
      conversation_id: "11111111-1111-7111-8111-111111111111",
      message: "show btrfs",
      response_mode: "application",
    });
    expect(calls.some(call => ["Chat", "generate_spec", "apply_catalog_model_binding", "config_patch", "authorize_task", "promote_candidate"].includes(call.request.methodName))).toBe(false);
>>>>>>> Stashed changes
    const before = calls.length;
    const reference = await adapter.submit({ message: "/ui-reference btrfs", history: [], route });
    expect(reference.canvasSpec).toBeDefined();
    expect(calls).toHaveLength(before);
  });

  it("does not render an actionable or malformed committed UI, or fall back to Chat/generate_spec", async () => {
    const calls = mockDoor({
      ...catalog([{ provider_id: "openrouter", configured: true, enabled: true }]),
      ...chatResponseHandlers("Unsafe proposal", {
        canvas: { root: "run", elements: { run: { type: "button", props: { label: "Run" }, on: { press: { action: "execute" } } } } },
      }),
    });
    const adapter = await connectDoorChatAdapter(config);
    const response = await adapter.submit({ message: "run anything", history: [], route: { providerId: "", modelId: "" }, mode: "ui_render" });
    expect(response.canvasSpec).toBeUndefined();
    expect(response.message.content).toMatch(/not rendered|Canvas|component/i);
    expect(calls.some(call => ["Chat", "generate_spec", "apply_catalog_model_binding", "config_patch", "authorize_task"].includes(call.request.methodName))).toBe(false);
  });
});

it("refreshes once before each coalesced catalog read and preserves choices when the read fails", async () => {
  let current = "old";
  let fail = false;
  const calls = mockDoor({
    ...catalog(),
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
    "refresh",
    "list_providers",
    "list_models",
    "GetState",
    "refresh",
    "list_providers",
    "list_models",
    "refresh",
    "list_providers",
  ]);
  expect(calls.filter(call => call.request.methodName === "refresh")).toHaveLength(3);
  expect(calls.some(call => ["SetSelection", "config_set", "apply_catalog_model_binding", "Chat"].includes(call.request.methodName))).toBe(false);
});

it("stops a pending refresh at identity rotation without reading or publishing under the new identity", async () => {
  let refreshes = 0;
  let finish: ((response: CallMethodResponse) => void) | undefined;
  const fixture = catalog([{ provider_id: "vendor", configured: true, enabled: true, status: "ok" }],
    [{ provider_id: "vendor", model_id: "original", available: true }]);
  const calls = mockDoor({
    ...fixture,
    refresh: () => ++refreshes === 1 ? fixture.refresh()
      : new Promise<CallMethodResponse>(resolve => { finish = resolve; }),
  });
  const adapter = await connectDoorChatAdapter(config);
  const pending = adapter.refreshProviders!();
  // Attach the rejection assertion before resolving the pending operation.
  const rejected = expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  adapter.setIdentity({ kind: "oia1", assertion: "RUZHSA==" });
  finish!(fixture.refresh());
  await rejected;
  expect(adapter.providers[0].models[0].id).toBe("original");
  expect(calls.map(call => call.request.methodName)).toEqual(["refresh", "list_providers", "list_models", "GetState", "refresh"]);
  expect(calls.at(-1)!.meta[OIA1_HEADER]).toBe(config.identity.assertion);
});
