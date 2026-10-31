import { cleanup, render, screen, waitFor, within } from "@testing-library/svelte";
import { afterEach, expect, it, vi } from "vitest";
import { connect } from "./connect";
import { createLocalChatAdapter } from "../chat/local-chat-adapter";
import type { DoorChatAdapter } from "../chat/door-chat-adapter";
import type { ResolvedChatContext } from "../chat/chat-mode";
import App from "./App.svelte";

vi.mock("./connect", () => ({ connect: vi.fn() }));
afterEach(() => { cleanup(); sessionStorage.clear(); vi.clearAllMocks(); });

it("binds a remote startup result into the existing page canvas after context resolves", async () => {
  const context: ResolvedChatContext = {
    session_id: "startup-fixture", mode: "personal", project_id: null,
    memory_namespace: "session/startup-fixture/personal/main", read_only: false,
    effective_capabilities: [], allowed_agents: [], selected_agent: null,
  };
  const spec = { root: "loaded", elements: {
    loaded: { type: "text", props: { text: "Remote fixture view loaded", className: null } },
  } };
  const adapter = {
    ...createLocalChatAdapter(0), kind: "remote",
    committedRoute: { providerId: "local-lab", modelId: "atlas-compact" },
    routeInitiallyApplied: true,
    getChatContext: vi.fn().mockResolvedValue(context),
    selectChatMode: vi.fn().mockResolvedValue(context),
    listProjects: vi.fn().mockResolvedValue([]),
    listNotebooks: vi.fn().mockResolvedValue([]),
    submit: vi.fn().mockResolvedValue({
      message: { id: "startup-view", role: "agent", content: "Rendered the requested interface." },
      canvasSpec: spec,
    }),
  } as unknown as DoorChatAdapter;
  vi.mocked(connect).mockResolvedValue({ state: "ready", adapter });
  render(App);
  await waitFor(() => expect(adapter.submit).toHaveBeenCalledTimes(1));
  const canvas = await screen.findByRole("main", { name: "Interface canvas" });
  expect(await within(canvas).findByText("Remote fixture view loaded")).toBeVisible();
  expect(screen.queryByRole("menubar", { name: "Main" })).not.toBeInTheDocument();
  expect(adapter.getChatContext).toHaveBeenCalledTimes(1);
});
