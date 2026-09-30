import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatAdapter } from "./chat-adapter";
import type { NotebookSummary, ProjectSummary, ResolvedChatContext } from "./chat-mode";
import { ModeStrip } from "./ModeStrip";

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

function doorAdapter(
  projects: ProjectSummary[] = [],
  context: ResolvedChatContext = personal,
  notebooks: NotebookSummary[] = [],
) {
  const getChatContext = vi.fn().mockResolvedValue(context);
  const listProjects = vi.fn().mockResolvedValue(projects);
  const listNotebooks = vi.fn().mockResolvedValue(notebooks);
  const selectNotebook = vi.fn().mockResolvedValue(undefined);
  const selectChatMode = vi.fn().mockImplementation(async ({ mode, personalNamespace }: { mode: string; personalNamespace?: string }) => ({
    ...personal,
    mode,
    memory_namespace: mode === "ui_render"
      ? ""
      : mode === "notebook_lm"
        ? "session/own-session/notebooklm/nb-1"
        : mode === "personal"
          ? `session/own-session/personal/${personalNamespace ?? "main"}`
          : `session/own-session/${mode}`,
  }));
  const adapter = { kind: "remote", getChatContext, listProjects, listNotebooks, selectNotebook, selectChatMode } as unknown as ChatAdapter;
  return { adapter, getChatContext, listProjects, listNotebooks, selectNotebook, selectChatMode };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("ModeStrip", () => {
  it("shows loading, Personal, and Project even when no project is ready", async () => {
    const { adapter } = doorAdapter();
    render(<ModeStrip adapter={adapter} />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading chat mode");

    const selector = await screen.findByRole("combobox", { name: "Mode" });
    expect(selector).toHaveValue("personal");
    expect([...selector.querySelectorAll("option")].map((option) => option.textContent)).toEqual([
      "Personal", "Project", "Control plane", "Accountability", "NotebookLM", "UI render",
    ]);
    expect(screen.getByRole("combobox", { name: "Namespace" })).toHaveValue("main");
    expect(screen.getByText("session/own-session/personal/main")).toBeInTheDocument();
  });

  it("loads main when personal mode has no namespace", async () => {
    const { adapter, selectChatMode } = doorAdapter([], {
      ...personal,
      memory_namespace: "session/own-session/personal",
    });
    render(<ModeStrip adapter={adapter} />);
    expect(await screen.findByRole("combobox", { name: "Namespace" })).toHaveValue("main");
    expect(selectChatMode).toHaveBeenCalledWith({
      mode: "personal",
      projectId: undefined,
      personalNamespace: "main",
    });
    expect(await screen.findByText("session/own-session/personal/main")).toBeInTheDocument();
  });

  it("adds a namespace from New and selects it", async () => {
    const { adapter, selectChatMode } = doorAdapter();
    render(<ModeStrip adapter={adapter} />);
    const namespaces = await screen.findByRole("combobox", { name: "Namespace" });
    fireEvent.change(namespaces, { target: { value: "__new__" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Not Valid" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("alert")).toHaveTextContent("1 to 64");
    expect(selectChatMode).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "notes" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(selectChatMode).toHaveBeenCalledWith({
      mode: "personal",
      projectId: undefined,
      personalNamespace: "notes",
    });
    expect(await screen.findByRole("option", { name: "notes" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Namespace" })).toHaveValue("notes");
  });

  it("requires choosing a ready accessible project before selecting Project mode", async () => {
    const { adapter, selectChatMode } = doorAdapter([
      { project_id: "pending", title: "Pending", status: "provisioning" },
      { project_id: "ready", title: "Ready project", status: "ready" },
    ]);
    render(<ModeStrip adapter={adapter} />);
    const mode = await screen.findByRole("combobox", { name: "Mode" });
    expect(await screen.findByRole("option", { name: "Project" })).toBeInTheDocument();

    fireEvent.change(mode, { target: { value: "project" } });
    expect(selectChatMode).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Personal remains active");
    const project = screen.getByRole("combobox", { name: "Project" });
    expect(project).toHaveValue("");
    expect(screen.queryByRole("option", { name: "Pending" })).not.toBeInTheDocument();
    fireEvent.change(project, { target: { value: "ready" } });
    expect(selectChatMode).toHaveBeenCalledWith({ mode: "project", projectId: "ready", personalNamespace: undefined });
    expect(await screen.findByText("session/own-session/project")).toBeInTheDocument();
  });

  it("fills a notebook dropdown and enters NotebookLM only after a notebook is chosen", async () => {
    const { adapter, selectChatMode, selectNotebook } = doorAdapter([], personal, [
      { id: "nb-1", title: "Field notes" },
      { id: "nb-2", title: "Design" },
    ]);
    render(<ModeStrip adapter={adapter} />);
    const mode = await screen.findByRole("combobox", { name: "Mode" });

    fireEvent.change(mode, { target: { value: "notebook_lm" } });
    expect(selectChatMode).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Personal remains active");
    const notebook = screen.getByRole("combobox", { name: "Notebook" });
    expect(screen.getByRole("option", { name: "Field notes" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Design" })).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(notebook, { target: { value: "nb-1" } });
    });
    expect(selectNotebook).toHaveBeenCalledWith("nb-1");
    expect(selectChatMode).toHaveBeenCalledWith({ mode: "notebook_lm", projectId: undefined, personalNamespace: undefined });
    expect(await screen.findByText("session/own-session/notebooklm/nb-1")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Notebook" })).toHaveValue("nb-1");
  });

  it("opens NotebookLM on the wishlist notebook when that notebook is listed", async () => {
    const { adapter, selectChatMode, selectNotebook } = doorAdapter([], personal, [
      { id: "nb-1", title: "Field notes" },
      { id: "wish", title: "wishlist" },
    ]);
    render(<ModeStrip adapter={adapter} />);
    const mode = await screen.findByRole("combobox", { name: "Mode" });

    await act(async () => {
      fireEvent.change(mode, { target: { value: "notebook_lm" } });
    });

    expect(selectNotebook).toHaveBeenCalledWith("wish");
    expect(selectChatMode).toHaveBeenCalledWith({ mode: "notebook_lm", projectId: undefined, personalNamespace: undefined });
    expect(await screen.findByText("session/own-session/notebooklm/nb-1")).toBeInTheDocument();
  });

  it("auto-selects the wishlist notebook when it arrives after NotebookLM is requested", async () => {
    let resolveNotebooks!: (list: NotebookSummary[]) => void;
    const { adapter, selectChatMode, selectNotebook, listNotebooks } = doorAdapter();
    listNotebooks.mockImplementation(() => new Promise((resolve) => { resolveNotebooks = resolve; }));
    render(<ModeStrip adapter={adapter} />);
    const mode = await screen.findByRole("combobox", { name: "Mode" });

    fireEvent.change(mode, { target: { value: "notebook_lm" } });
    expect(screen.getByRole("combobox", { name: "Notebook" })).toBeInTheDocument();
    expect(selectNotebook).not.toHaveBeenCalled();

    await act(async () => {
      resolveNotebooks([{ id: "wish", title: "wishlist" }]);
    });

    expect(selectNotebook).toHaveBeenCalledTimes(1);
    expect(selectNotebook).toHaveBeenCalledWith("wish");
    expect(selectChatMode).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("session/own-session/notebooklm/nb-1")).toBeInTheDocument();
  });

  it("continues to show a server-selected project if the project list no longer includes it", async () => {
    const context: ResolvedChatContext = {
      ...personal,
      mode: "project",
      project_id: "former",
      memory_namespace: "project/former",
    };
    const { adapter } = doorAdapter([], context);
    render(<ModeStrip adapter={adapter} />);

    expect(await screen.findByRole("combobox", { name: "Mode" })).toHaveValue("project");
    expect(screen.getByRole("combobox", { name: "Project" })).toHaveValue("former");
    expect(screen.getByRole("option", { name: "Current project (former)" })).toBeInTheDocument();
  });

  it("shows a failed context read and retries without inventing a Personal selection", async () => {
    const { adapter, getChatContext } = doorAdapter();
    getChatContext.mockRejectedValueOnce(new Error("Context temporarily unavailable"));
    render(<ModeStrip adapter={adapter} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Context temporarily unavailable");
    expect(screen.queryByRole("combobox", { name: "Mode" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry chat mode" }));
    expect(await screen.findByRole("combobox", { name: "Mode" })).toHaveValue("personal");
    expect(getChatContext).toHaveBeenCalledTimes(2);
  });

  it("keeps the current mode when the door refuses a selection", async () => {
    const { adapter, selectChatMode } = doorAdapter();
    selectChatMode.mockRejectedValueOnce(new Error("Control-plane grant required"));
    render(<ModeStrip adapter={adapter} />);
    const selector = await screen.findByRole("combobox", { name: "Mode" });

    fireEvent.change(selector, { target: { value: "control_plane" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Control-plane grant required");
    expect(selector).toHaveValue("personal");

    fireEvent.change(selector, { target: { value: "accountability" } });
    expect(await screen.findByText("session/own-session/accountability")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
