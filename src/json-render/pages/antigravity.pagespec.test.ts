import { chatScopeKey } from "../../chat/chat-scope";
import Harness from "../../test/fixtures/Harness.svelte";
import { act, cleanup, fireEvent, render, screen } from "../../test/native";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResolvedChatContext } from "../../chat/chat-mode";
import { createLocalChatAdapter } from "../../chat/local-chat-adapter";
import type { DoorChatAdapter } from "../../chat/door-chat-adapter";
import { antigravitySpec } from "./antigravity.pagespec";

const personal: ResolvedChatContext = {
  mode: "personal",
  session_id: "own-session",
  project_id: null,
  memory_namespace: "session/own-session/personal/main",
  read_only: false,
  effective_capabilities: ["chat.context"],
  allowed_agents: [],
  selected_agent: null,
};


afterEach(() => cleanup());

describe("ChatOnly page spec", () => {
  it("keys history by the door's verified session, mode, project and memory namespace", () => {
    const base = chatScopeKey(personal, true);
    expect(chatScopeKey({ ...personal, session_id: "other" }, true)).not.toBe(base);
    expect(chatScopeKey({ ...personal, mode: "project", project_id: "project-a" }, true)).not.toBe(base);
    expect(chatScopeKey({ ...personal, memory_namespace: "session/own-session/personal/subspace" }, true)).not.toBe(base);
    expect(chatScopeKey({ ...personal, mode: "project", project_id: "project-b" }, true))
      .not.toBe(chatScopeKey({ ...personal, mode: "project", project_id: "project-a" }, true));
  });
  it("renders the catalog mode selector and changes mode only after the door responds", async () => {
    expect(antigravitySpec.elements["chat-mode"]).toMatchObject({
      type: "chatModeSelector",
      props: {},
    });
    expect(antigravitySpec.elements.root.children).toContain("chat-mode");

    let resolveSelection!: (context: ResolvedChatContext) => void;
    const selectChatMode = vi.fn().mockReturnValue(new Promise<ResolvedChatContext>((resolve) => {
      resolveSelection = resolve;
    }));
    const adapter = {
      ...createLocalChatAdapter(),
      kind: "remote",
      getChatContext: vi.fn().mockResolvedValue(personal),
      listProjects: vi.fn().mockResolvedValue([]),
      selectChatMode,
    } as unknown as DoorChatAdapter;

    render(
      Harness, { adapter: adapter, view: "spec" },
    );
    const mode = await screen.findByRole("combobox", { name: "Mode" });
    expect(mode).toHaveValue("personal");
    expect(screen.getByRole("option", { name: "Project" })).toBeInTheDocument();
    expect(screen.getByText("Canvas content will appear here when returned by the chat.")).toBeInTheDocument();
    expect(screen.queryByText("atlas-compact")).not.toBeInTheDocument();
    expect(screen.queryByText("LOCAL INTENT")).not.toBeInTheDocument();

    fireEvent.change(mode, { target: { value: "ui_render" } });
    expect(selectChatMode).toHaveBeenCalledWith({
      mode: "ui_render",
      projectId: undefined,
      personalNamespace: undefined,
    });
    expect(mode).toHaveValue("personal");
    await act(async () => {
      resolveSelection({ ...personal, mode: "ui_render", memory_namespace: "", read_only: true });
    });
    expect(mode).toHaveValue("ui_render");
    expect(screen.getByText("no memory")).toBeInTheDocument();
  });

  it("preserves the local canvas demo for an offline workspace", () => {
    render(Harness, { adapter: createLocalChatAdapter(), view: "spec" });
    expect(screen.getByText("LOCAL INTENT")).toBeInTheDocument();
    expect(screen.getByText("atlas-compact")).toBeInTheDocument();
    expect(screen.queryByText("Canvas content will appear here when returned by the chat.")).not.toBeInTheDocument();
  });

  it("keeps the provider picker after the door confirms Control Plane", async () => {
    const adapter = {
      ...createLocalChatAdapter(),
      kind: "remote",
      getChatContext: vi.fn().mockResolvedValue(personal),
      listProjects: vi.fn().mockResolvedValue([]),
      selectChatMode: vi.fn().mockResolvedValue({ ...personal, mode: "control_plane" }),
    } as unknown as DoorChatAdapter;
    render(Harness, { adapter: adapter, view: "spec" });
    const mode = await screen.findByRole("combobox", { name: "Mode" });
    expect(screen.getByRole("region", { name: "Router model selection" })).toBeInTheDocument();
    fireEvent.change(mode, { target: { value: "control_plane" } });
    expect(await screen.findByRole("combobox", { name: "Mode" })).toHaveValue("control_plane");
    expect(screen.getByRole("region", { name: "Router model selection" })).toBeInTheDocument();
  });

  it("keeps each verified mode's thread and Canvas separate across a late reply", async () => {
    let finishPersonal!: (response: { message: { id: string; role: "agent"; content: string }; canvasSpec: typeof personalCanvas }) => void;
    const personalCanvas = { root: "status", elements: { status: { type: "dashboardStatus", props: { label: "Personal canvas", tone: "info" } } } } as const;
    const adapter = {
      ...createLocalChatAdapter(),
      kind: "remote",
      getChatContext: vi.fn().mockResolvedValue(personal),
      listProjects: vi.fn().mockResolvedValue([]),
      selectChatMode: vi.fn().mockImplementation(async ({ mode }: { mode: string }) => ({
        ...personal,
        mode,
        memory_namespace: mode === "ui_render" ? "" : personal.memory_namespace,
      })),
      submit: vi.fn().mockImplementation(({ mode }: { mode: string }) => mode === "personal"
        ? new Promise(resolve => { finishPersonal = resolve; })
        : Promise.resolve({ message: { id: "render-reply", role: "agent", content: "Render answer" } })),
    } as unknown as DoorChatAdapter;
    render(Harness, { adapter: adapter, view: "spec" });
    const mode = await screen.findByRole("combobox", { name: "Mode" });
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "personal request" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByText("personal request")).toBeInTheDocument();

    await act(async () => fireEvent.change(mode, { target: { value: "ui_render" } }));
    expect(mode).toHaveValue("ui_render");
    expect(screen.queryByText("personal request")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "render request" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Render answer")).toBeInTheDocument();

    await act(async () => finishPersonal({ message: { id: "personal-reply", role: "agent", content: "Personal answer" }, canvasSpec: personalCanvas }));
    expect(screen.queryByText("Personal answer")).not.toBeInTheDocument();
    expect(screen.queryByText("Personal canvas")).not.toBeInTheDocument();
    expect(screen.getByText("Render answer")).toBeInTheDocument();

    await act(async () => fireEvent.change(mode, { target: { value: "personal" } }));
    expect(screen.getByText("personal request")).toBeInTheDocument();
    expect(screen.getByText("Personal answer")).toBeInTheDocument();
    expect(screen.getAllByText("Personal canvas")).toHaveLength(2);
    expect(screen.queryByText("Render answer")).not.toBeInTheDocument();
  });

  it("keeps a late error in its original mode", async () => {
    let rejectPersonal!: (error: Error) => void;
    const adapter = {
      ...createLocalChatAdapter(),
      kind: "remote",
      getChatContext: vi.fn().mockResolvedValue(personal),
      listProjects: vi.fn().mockResolvedValue([]),
      selectChatMode: vi.fn().mockImplementation(async ({ mode }: { mode: string }) => ({
        ...personal, mode, memory_namespace: mode === "ui_render" ? "" : personal.memory_namespace,
      })),
      submit: vi.fn().mockImplementation(({ mode }: { mode: string }) => mode === "personal"
        ? new Promise((_resolve, reject) => { rejectPersonal = reject; })
        : Promise.resolve({ message: { id: "render-reply", role: "agent", content: "Render answer" } })),
    } as unknown as DoorChatAdapter;
    render(Harness, { adapter: adapter, view: "spec" });
    const mode = await screen.findByRole("combobox", { name: "Mode" });
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "personal request" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await act(async () => fireEvent.change(mode, { target: { value: "ui_render" } }));
    await act(async () => rejectPersonal(new Error("Personal route failed")));
    expect(screen.queryByRole("alert", { name: "Personal route failed" })).not.toBeInTheDocument();
    expect(screen.queryByText("Personal route failed")).not.toBeInTheDocument();
    await act(async () => fireEvent.change(mode, { target: { value: "personal" } }));
    expect(screen.getByRole("alert")).toHaveTextContent("Personal route failed");
  });
});

it("refreshes the picker only on the explicit button without selecting a replacement", async () => {
  const old = [{ id: "vendor", label: "Vendor", models: [{ id: "old", label: "Old", detail: "" }] }];
  const next = [{ ...old[0], models: [{ id: "new", label: "New", detail: "" }] }];
  const refreshProviders = vi.fn().mockResolvedValue(next);
  const selectRoute = vi.fn();
  const adapter = {
    ...createLocalChatAdapter(),
    kind: "remote",
    providers: old,
    refreshProviders,
    selectRoute,
    getChatContext: vi.fn().mockResolvedValue(personal),
    selectChatMode: vi.fn().mockResolvedValue(personal),
    listProjects: vi.fn().mockResolvedValue([]),
  } as unknown as DoorChatAdapter;
  render(Harness, { adapter: adapter, view: "spec" });
  const model = await screen.findByRole("combobox", { name: "Model" });
  await act(async () => { fireEvent.focus(model); });
  expect(refreshProviders).not.toHaveBeenCalled();
  expect(screen.getByRole("option", { name: "Old" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "New" })).not.toBeInTheDocument();
  expect(model).toHaveValue("old");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Refresh models" })); });
  expect(screen.getByRole("option", { name: "New" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "old (no longer listed)" })).toBeDisabled();
  expect(model).toHaveValue("old");
  expect(selectRoute).not.toHaveBeenCalled();
  expect(refreshProviders).toHaveBeenCalledTimes(1);
  expect(selectRoute).not.toHaveBeenCalled();
});
