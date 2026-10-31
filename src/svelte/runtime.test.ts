import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import Harness from "../test/fixtures/Harness.svelte";
import { Runtime } from "./runtime.svelte";
import { createLocalChatAdapter } from "../chat/local-chat-adapter";
import type { ChatAdapter, ChatResponse } from "../chat/chat-adapter";
import type { ResolvedChatContext } from "../chat/chat-mode";

afterEach(cleanup);

const context: ResolvedChatContext = {
  session_id: "session", mode: "personal", project_id: null,
  memory_namespace: "session/session/personal/main", read_only: false,
  effective_capabilities: [], allowed_agents: [], selected_agent: null,
};
const result: ChatResponse = {
  message: { id: "generated", role: "agent", content: "Your interface" },
  canvasSpec: {
    root: "welcome",
    elements: { welcome: { type: "heading", props: { text: "Welcome", level: 1 } } },
  },
};
function setup(submit: ChatAdapter["submit"] = vi.fn().mockResolvedValue(result)) {
  const runtime = new Runtime({ ...createLocalChatAdapter(0), kind: "remote", submit });
  runtime.setChatContext(context);
  return runtime;
}
function deferred() {
  let resolve!: (response: ChatResponse) => void;
  const promise = new Promise<ChatResponse>((finish) => { resolve = finish; });
  return { promise, resolve };
}

describe("post-login interface lifecycle", () => {
  it("waits for verified context, coalesces pending loads, and generates once per scope", async () => {
    const pending = deferred();
    const submit = vi.fn().mockReturnValue(pending.promise);
    const runtime = new Runtime({ ...createLocalChatAdapter(0), kind: "remote", submit });
    await runtime.loadInterface();
    expect(submit).not.toHaveBeenCalled();
    runtime.setChatContext(context);
    const loading = runtime.loadInterface();
    await runtime.loadInterface();
    expect(runtime.interfacePending).toBe(true);
    pending.resolve(result);
    await loading;
    expect(runtime.canvasSpec).toEqual(result.canvasSpec);
    expect(runtime.interfacePending).toBe(false);
    await runtime.loadInterface();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0][0].mode).toBe("ui_render");
    expect(runtime.chatContext).toEqual(context);
    runtime.dispose();
  });

  it("surfaces generation refusal without silently retrying or rendering samples", async () => {
    const submit = vi.fn().mockResolvedValueOnce({
      message: { id: "refused", role: "agent", content: "The identity lacks this capability." },
    }).mockResolvedValueOnce(result);
    const runtime = setup(submit);
    await runtime.loadInterface();
    expect(runtime.interfaceError).toBe("The identity lacks this capability.");
    expect(runtime.canvasSpec.elements[runtime.canvasSpec.root].type).toBe("interfaceGeneration");
    await runtime.loadInterface();
    expect(submit).toHaveBeenCalledTimes(1);
    await runtime.loadInterface(true);
    expect(runtime.interfaceError).toBeNull();
    expect(runtime.canvasSpec).toEqual(result.canvasSpec);
    runtime.dispose();
  });

  it("rejects generated runtime controls instead of treating them as a presentation", async () => {
    const runtime = setup(async () => ({
      ...result,
      canvasSpec: { root: "control", elements: { control: { type: "chatModeSelector", props: {} } } },
    }));
    await runtime.loadInterface();
    expect(runtime.interfaceError).toContain("Invalid Canvas component");
    expect(runtime.canvases.has(runtime.scopeKey)).toBe(false);
    runtime.dispose();
  });

  it("discards late replies after a scope switch or disposal", async () => {
    const old = deferred(), current = deferred();
    const submit = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const runtime = setup(submit);
    const oldLoad = runtime.loadInterface();
    runtime.setChatContext({ ...context, mode: "project", project_id: "project" });
    const newLoad = runtime.loadInterface();
    old.resolve(result);
    await oldLoad;
    expect(runtime.canvases.has(runtime.scopeKey)).toBe(false);
    expect(runtime.interfacePending).toBe(true);
    runtime.dispose();
    current.resolve(result);
    await newLoad;
    expect(runtime.canvases.has(runtime.scopeKey)).toBe(false);
  });

  it("does not replace a newer user-requested canvas with a late login interface", async () => {
    const pending = deferred();
    const runtime = setup(() => pending.promise);
    const loading = runtime.loadInterface();
    const latest = {
      root: "latest", elements: { latest: { type: "text", props: { text: "User result", className: null } } },
    };
    runtime.setCanvas(latest);
    pending.resolve(result);
    await loading;
    expect(runtime.canvasSpec).toEqual(latest);
    runtime.dispose();
  });

  it("automatically renders after authentication and exposes refusal recovery in the catalog UI", async () => {
    const pending = deferred();
    const submit = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce(result);
    render(Harness, {
      view: "interface",
      adapter: { ...createLocalChatAdapter(0), kind: "remote", submit },
    });
    expect(screen.getByRole("status")).toHaveTextContent("Waiting for the authenticated chat context");
    await fireEvent.click(screen.getByRole("button", { name: "Authenticated context" }));
    expect(await screen.findByRole("status")).toHaveTextContent("The chatbot is generating your interface");
    pending.resolve({ message: { id: "denied", role: "agent", content: "Generation refused by the door." } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Generation refused by the door.");
    await fireEvent.click(screen.getByRole("button", { name: "Retry interface generation" }));
    expect(await screen.findByRole("heading", { name: "Welcome" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the local workbench entirely offline", async () => {
    const submit = vi.fn();
    const runtime = new Runtime({ ...createLocalChatAdapter(0), submit });
    runtime.setChatContext(context);
    await runtime.loadInterface();
    expect(submit).not.toHaveBeenCalled();
    runtime.dispose();
  });
});
