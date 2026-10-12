import { afterEach, describe, expect, it, vi } from "vitest";
import { clearRegisteredComponents, registeredComponent } from "../json-render/references/registered-components";
import { readCanvasResponse } from "../json-render/references/canvas-contract";
import { ChatSession, type ChatRuntime } from "./chat-session";
import { createLocalChatAdapter } from "../chat/local-chat-adapter";
import type { ChatResponse } from "../chat/chat-adapter";
import type { DoorChatAdapter } from "../chat/door-chat-adapter";
import type { ResolvedChatContext } from "../chat/chat-mode";

const personal: ResolvedChatContext = {
  session_id: "session",
  mode: "personal",
  project_id: null,
  memory_namespace: "session/session/personal/main",
  read_only: false,
  effective_capabilities: [],
  allowed_agents: [],
  selected_agent: null,
};
const response: ChatResponse = {
  message: { id: "reply", role: "agent", content: "An answer" },
  canvasSpec: {
    root: "text",
    elements: {
      text: { type: "text", props: { text: "A result", className: null } },
    },
  },
};
function setup(adapter = createLocalChatAdapter(0)) {
  const runtime: ChatRuntime = {
    adapter,
    scopeKey: "personal",
    context: personal,
    route: { providerId: "local-lab", modelId: "atlas-compact" },
    modelLabel: "Atlas Compact",
    setCanvas: vi.fn(),
  };
  const session = new ChatSession();
  session.configure(runtime);
  return { session, runtime };
}

describe("Svelte chat session", () => {
  it("submits through the adapter, keeps inline specs out of history, and clears the local view", async () => {
    const adapter = {
      ...createLocalChatAdapter(0),
      submit: vi.fn().mockResolvedValue(response),
    };
    const { session } = setup(adapter);
    session.setDraft("First\nrequest");
    await session.submit();
    expect(session.current.messages[1].canvasSpec).toEqual(response.canvasSpec);
    await session.submit("Follow-up");
    expect(adapter.submit.mock.calls[1][0].history).toHaveLength(3);
    expect(adapter.submit.mock.calls[1][0].history[1]).not.toHaveProperty(
      "canvasSpec",
    );
    session.clear();
    expect(session.current.messages).toEqual([]);
    expect(session.current.draft).toBe("");
  });

  it("isolates drafts, pending requests, late replies, and canvas setters by verified scope", async () => {
    let finish!: (reply: ChatResponse) => void;
    const adapter = {
      ...createLocalChatAdapter(0),
      submit: vi.fn().mockImplementation(
        () =>
          new Promise<ChatResponse>((resolve) => {
            finish = resolve;
          }),
      ),
    };
    const { session, runtime } = setup(adapter);
    const pending = session.submit("Personal question");
    void session.submit("Duplicate");
    expect(adapter.submit).toHaveBeenCalledTimes(1);
    session.clear();
    expect(session.current.sending).toBe(true);
    const next = {
      ...runtime,
      scopeKey: "project",
      context: { ...personal, mode: "project" as const, project_id: "a" },
      setCanvas: vi.fn(),
    };
    session.configure(next);
    session.setDraft("Project draft");
    finish(response);
    await pending;
    expect(session.current.messages).toEqual([]);
    expect(session.current.draft).toBe("Project draft");
    expect(next.setCanvas).not.toHaveBeenCalled();
    expect(runtime.setCanvas).toHaveBeenCalledWith(response.canvasSpec);
    session.configure(runtime);
    expect(session.current.messages.map((item) => item.content)).toEqual([
      "Personal question",
      "An answer",
    ]);
    expect(session.current.sending).toBe(false);
  });

  it("keeps late failures in their original scope and restores the failed draft", async () => {
    let reject!: (error: Error) => void;
    const { session, runtime } = setup({
      ...createLocalChatAdapter(0),
      submit: () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    });
    const pending = session.submit("Retry me");
    session.configure({ ...runtime, scopeKey: "other" });
    reject(new Error("Door refused request"));
    await pending;
    expect(session.current.error).toBeNull();
    session.configure(runtime);
    expect(session.current.error).toBe("Door refused request");
    expect(session.current.draft).toBe("Retry me");
  });

  it("excludes a thrown request from later model history while retaining completed exchanges", async () => {
    const adapter = {
      ...createLocalChatAdapter(0),
      submit: vi.fn()
        .mockResolvedValueOnce(response)
        .mockRejectedValueOnce(new Error("Door refused request"))
        .mockResolvedValueOnce(response),
    };
    const { session } = setup(adapter);
    await session.submit("Earlier question");
    await session.submit("Unsent request");
    expect(session.current.draft).toBe("Unsent request");
    expect(session.current.messages.at(-1)?.content).toBe("Unsent request");
    await session.submit("hi");
    expect(adapter.submit.mock.calls[2][0].history.map((item: { content: string }) => item.content)).toEqual([
      "Earlier question", "An answer", "hi",
    ]);
  });

  it("retains a completed exchange after canvas presentation fails without preparing a replay", async () => {
    const adapter = {
      ...createLocalChatAdapter(0),
      submit: vi.fn().mockResolvedValue(response),
    };
    const { session, runtime } = setup(adapter);
    session.configure({ ...runtime, setCanvas: () => { throw new Error("Canvas unavailable"); } });
    await session.submit("Completed request");
    expect(session.current.error).toBe("Canvas unavailable");
    expect(session.current.draft).toBe("");
    session.configure(runtime);
    await session.submit("hi");
    expect(adapter.submit.mock.calls[1][0].history.map((item: { content: string }) => item.content)).toEqual([
      "Completed request", "An answer", "hi",
    ]);
  });

  it("requires a confirmed remote scope and ignores responses after disposal", async () => {
    const submit = vi.fn().mockResolvedValue(response);
    const { session, runtime } = setup({
      ...createLocalChatAdapter(0),
      kind: "remote",
      submit,
    });
    session.configure({ ...runtime, context: null });
    await session.submit("Blocked");
    expect(submit).not.toHaveBeenCalled();
    session.configure(runtime);
    const pending = session.submit("Started");
    session.dispose();
    await pending;
    expect(runtime.setCanvas).not.toHaveBeenCalled();
  });

  it("skips the Personal catalog read, retains it in Project, and saves UI render candidates", async () => {
    const gallery = {
      activeCatalog: vi.fn().mockResolvedValue([]),
      saveCandidate: vi.fn().mockResolvedValue({}),
    };
    const adapter = {
      ...createLocalChatAdapter(0),
      kind: "remote",
      gallery,
      submit: vi.fn().mockResolvedValue(response),
    } as unknown as DoorChatAdapter;
    const { session, runtime } = setup(adapter);
    await session.submit("Personal");
    expect(gallery.activeCatalog).not.toHaveBeenCalled();
    session.configure({
      ...runtime,
      scopeKey: "project",
      context: { ...personal, mode: "project", project_id: "a" },
    });
    await session.submit("Project");
    expect(gallery.activeCatalog).toHaveBeenCalledTimes(1);
    session.configure({
      ...runtime,
      scopeKey: "ui",
      context: { ...personal, mode: "ui_render" },
    });
    await session.submit("Draw a dashboard");
    expect(gallery.activeCatalog).toHaveBeenCalledTimes(1);
    expect(gallery.saveCandidate).toHaveBeenCalledWith({
      spec: response.canvasSpec,
      title: "Draw a dashboard",
      prompt: "Draw a dashboard",
      mode: "ui_render",
    });
    expect(session.current.messages[1].saved).toBe(true);
  });

  it.each(["scope", "context", "mode round trip", "route", "route round trip"] as const)(
    "does not dispatch a preloaded request after a %s change",
    async change => {
      let finish!: (catalog: []) => void;
      const gallery = {
        activeCatalog: vi.fn(() => new Promise<[]>((resolve) => { finish = resolve; })),
      };
      const adapter = {
        ...createLocalChatAdapter(0),
        kind: "remote",
        gallery,
        submit: vi.fn().mockResolvedValue(response),
      } as unknown as DoorChatAdapter;
      const { session, runtime } = setup(adapter);
      const original: ChatRuntime = {
        ...runtime,
        scopeKey: "project",
        context: { ...personal, mode: "project", project_id: "a" },
      };
      session.configure(original);
      const pending = session.submit("Keep this request here");
      if (change === "scope") {
        session.configure({ ...original, scopeKey: "other" });
      } else if (change === "context" || change === "mode round trip") {
        session.configure({ ...original, context: { ...personal, mode: "ui_render" } });
        if (change === "mode round trip") session.configure(original);
      } else {
        session.configure({ ...original, route: { providerId: "other", modelId: "other-model" } });
        if (change === "route round trip") session.configure(original);
      }
      finish([]);
      await pending;
      expect(adapter.submit).not.toHaveBeenCalled();
      session.configure(original);
      expect(session.current.error).toContain("changed before dispatch");
      expect(session.current.draft).toBe("Keep this request here");
      expect(session.current.sending).toBe(false);
    },
  );

  it("stops before the next private preload when the notebook context changes", async () => {
    let finish!: () => void;
    const gallery = { activeCatalog: vi.fn().mockResolvedValue([]) };
    const adapter = {
      ...createLocalChatAdapter(0),
      kind: "remote",
      gallery,
      getNotebook: vi.fn(() => new Promise<null>((resolve) => { finish = () => resolve(null); })),
      submit: vi.fn().mockResolvedValue(response),
    } as unknown as DoorChatAdapter;
    const { session, runtime } = setup(adapter);
    session.configure({
      ...runtime,
      scopeKey: "notebook",
      context: { ...personal, mode: "notebook_lm", memory_namespace: "session/session/notebooklm/nb-1" },
    });
    const pending = session.submit("Notebook question");
    session.configure(runtime);
    finish();
    await pending;
    expect(gallery.activeCatalog).not.toHaveBeenCalled();
    expect(adapter.submit).not.toHaveBeenCalled();
  });

  it("allows display-only changes during preloading and retains an admitted reply in its old thread", async () => {
    let finishCatalog!: (catalog: []) => void;
    let finishReply!: (reply: ChatResponse) => void;
    const gallery = {
      activeCatalog: vi.fn(() => new Promise<[]>((resolve) => { finishCatalog = resolve; })),
    };
    const adapter = {
      ...createLocalChatAdapter(0),
      kind: "remote",
      gallery,
      submit: vi.fn(() => new Promise<ChatResponse>((resolve) => { finishReply = resolve; })),
    } as unknown as DoorChatAdapter;
    const { session, runtime } = setup(adapter);
    const original: ChatRuntime = {
      ...runtime,
      scopeKey: "project",
      context: { ...personal, mode: "project", project_id: "a" },
    };
    session.configure(original);
    const pending = session.submit("Project question");
    session.configure({ ...original, layout: "canvas", modelLabel: "Updated label" });
    finishCatalog([]);
    await vi.waitFor(() => expect(adapter.submit).toHaveBeenCalledTimes(1));
    session.configure(runtime);
    finishReply(response);
    await pending;
    expect(session.current.messages).toEqual([]);
    session.configure(original);
    expect(session.current.messages.map(item => item.content)).toEqual(["Project question", "An answer"]);
  });

  it("saves a component the chatbot defined so the UI renderer can promote it", async () => {
    const defined = readCanvasResponse([
      "```component",
      JSON.stringify({
        name: "DeviceBoard",
        description: "Devices attached to one container.",
        spec: { root: "board", elements: { board: { type: "heading", props: { text: "Devices", level: 2 } } } },
      }),
      "```",
    ].join("\n"));
    const gallery = {
      activeCatalog: vi.fn().mockResolvedValue([]),
      saveCandidate: vi.fn().mockResolvedValue({}),
    };
    const adapter = {
      ...createLocalChatAdapter(0),
      kind: "remote",
      gallery,
      submit: vi.fn().mockResolvedValue({
        message: { id: "reply", role: "agent", content: defined.content },
        canvasSpec: response.canvasSpec,
        registered: defined.registered,
      }),
    } as unknown as DoorChatAdapter;
    const { session } = setup(adapter);
    await session.generateView("Render the containers page", "Containers");
    expect(registeredComponent("DeviceBoard")?.description).toBe("Devices attached to one container.");
    expect(gallery.saveCandidate).toHaveBeenCalledWith(expect.objectContaining({
      title: "DeviceBoard",
      prompt: "Devices attached to one container.",
      mode: "personal",
    }));
  });
});

afterEach(() => {
  clearRegisteredComponents();
});

it("registers every response block and removes all temporary objects when cleared or closed", async () => {
  const { scratchCatalogObjects } = await import("../json-render/references/chat-scratch");
  const spec = response.canvasSpec!;
  const adapter = { ...createLocalChatAdapter(0), submit: vi.fn().mockResolvedValue({ ...response, canvasSpecs: [spec, spec] }) };
  const { session, runtime } = setup(adapter);
  const clearCanvas = vi.fn();
  session.configure({ ...runtime, scopeKey: "multi-block-lifecycle", clearCanvas });
  await session.submit("Two views");
  const objects = scratchCatalogObjects("multi-block-lifecycle");
  expect(objects).toHaveLength(2);
  expect(objects[0].objectId).not.toBe(objects[1].objectId);
  expect(session.current.messages[1].canvasSpecs).toHaveLength(2);
  session.clear();
  expect(scratchCatalogObjects("multi-block-lifecycle")).toHaveLength(0);
  expect(clearCanvas).toHaveBeenCalledOnce();
  await session.submit("Two more views");
  expect(scratchCatalogObjects("multi-block-lifecycle")).toHaveLength(2);
  session.dispose();
  expect(scratchCatalogObjects("multi-block-lifecycle")).toHaveLength(0);
});
