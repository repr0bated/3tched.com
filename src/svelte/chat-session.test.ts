import { describe, expect, it, vi } from "vitest";
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

  it("loads notebook and active catalog through the adapter and saves UI render candidates", async () => {
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
});
