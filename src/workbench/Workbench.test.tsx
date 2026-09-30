import { Renderer } from "@json-render/react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalChatAdapter } from "../chat/local-chat-adapter";
import type { ChatAdapter } from "../chat/chat-adapter";
import type { DoorChatAdapter } from "../chat/door-chat-adapter";
import type { ResolvedChatContext } from "../chat/chat-mode";
import { antigravitySpec } from "../json-render/pages/antigravity.pagespec";
import { JsonRenderProvider, useJsonRender } from "../json-render/runtime/JsonRenderProvider";
import { EventEvidenceCitation } from "./AccountabilityEvidence";
import { CompliancePanel } from "./CompliancePanel";
import { useChatRuntime } from "../chat/ChatRuntimeProvider";

function Page() {
  const { registry } = useJsonRender();
  return <Renderer spec={antigravitySpec} registry={registry} />;
}
function mount(adapter: ChatAdapter = createLocalChatAdapter()) {
  return render(<JsonRenderProvider adapter={adapter}><Page /></JsonRenderProvider>);
}
function navigate(label: string) {
  fireEvent.click(within(screen.getByRole("navigation", { name: "Identity workspace" })).getByRole("button", { name: label }));
}

afterEach(cleanup);

describe("identity workbench", () => {
  it("provides horizontal destinations and keeps chat draft and selected model while switching views", () => {
    mount();
    const nav = screen.getByRole("navigation", { name: "Identity workspace" });
    expect(within(nav).getAllByRole("button").map(button => button.textContent)).toEqual(["Canvas", "Accountability", "Compliance", "Schema routing"]);
    const message = screen.getByLabelText("Message");
    fireEvent.change(message, { target: { value: "Keep my conversation" } });
    const model = screen.getByRole("combobox", { name: "Model" });
    const selected = (model as HTMLSelectElement).value;
    navigate("Compliance");
    expect(screen.getByText("Live lookup not connected")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Interface canvas" })).not.toBeInTheDocument();
    navigate("Schema routing");
    expect(screen.getByRole("region", { name: "Schema routing draft" })).toBeVisible();
    navigate("Canvas");
    expect(screen.getByRole("heading", { name: "Interface canvas" })).toBeVisible();
    expect(message).toHaveValue("Keep my conversation");
    expect(model).toHaveValue(selected);
  });

  it("places active local controls between the conversation and canvas", () => {
    const { container } = mount();
    const workbench = container.querySelector(".identity-workbench")!;
    const children = Array.from(workbench.children);
    expect(children.map(element => element.className)).toEqual(["conversation-column", "workbench-controls", "workspace"]);
    fireEvent.change(screen.getByRole("combobox", { name: "Layout" }), { target: { value: "canvas" } });
    expect(workbench).toHaveClass("identity-workbench--canvas");
    fireEvent.click(screen.getByRole("button", { name: "Inspect spec" }));
    expect(screen.getByText(/Current canvas spec/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Render again" }));
    expect(screen.getByText("Current spec rendered again.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Back to chat" }));
    expect(screen.getByLabelText("Message")).toHaveFocus();
  });

  it("keeps evidence drafts in an independent context below the control-plane chatbot", async () => {
    const context: ResolvedChatContext = {
      mode: "control_plane", session_id: "trial-session", project_id: null,
      memory_namespace: "session/trial-session/control_plane", read_only: false,
      effective_capabilities: [], allowed_agents: [], selected_agent: null,
    };
    const submit = vi.fn().mockResolvedValue({ message: { id: "reply", role: "agent", content: "Control-plane reply" } });
    const selectChatMode = vi.fn(async ({ mode }: { mode: ResolvedChatContext["mode"] }) => ({ ...context, mode }));
    const adapter = {
      ...createLocalChatAdapter(), kind: "remote", submit,
      getChatContext: vi.fn().mockResolvedValue(context), selectChatMode,
      listProjects: vi.fn().mockResolvedValue([]),
    } as unknown as DoorChatAdapter;
    mount(adapter);
    await screen.findByRole("combobox", { name: "Mode" });
    expect(screen.getByText("CONTROL-PLANE CONVERSATION")).toBeVisible();
    navigate("Accountability");
    const evidence = screen.getByRole("region", { name: "Recent-event evidence search" });
    expect(evidence.previousElementSibling).toBe(screen.getByRole("region", { name: "Conversation" }));
    fireEvent.change(screen.getByLabelText("Ask about recent events"), { target: { value: "Which tool changed this policy?" } });
    fireEvent.click(screen.getByRole("button", { name: "Prepare query" }));
    expect(within(evidence).getByText("Query draft")).toBeVisible();
    expect(submit).not.toHaveBeenCalled();
    expect(selectChatMode).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Explain your decision" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send" })); });
    expect(submit.mock.calls[0][0].history.map((message: { content: string }) => message.content)).toEqual(["Explain your decision"]);
    expect(within(evidence).queryByText("Control-plane reply")).not.toBeInTheDocument();
    navigate("Canvas");
    navigate("Accountability");
    expect(within(evidence).getByText("Which tool changed this policy?")).toBeVisible();
  });

  it("creates only inspectable local routing drafts from actual listed models", () => {
    const adapter = createLocalChatAdapter();
    const selectRoute = vi.spyOn(adapter, "selectRoute");
    const submit = vi.spyOn(adapter, "submit");
    mount(adapter);
    navigate("Schema routing");
    fireEvent.change(screen.getByLabelText("Schema tag"), { target: { value: "proposed.tag" } });
    const candidate = screen.getByRole("combobox", { name: "Candidate model" });
    const options = within(candidate).getAllByRole("option");
    expect(options).toHaveLength(1 + adapter.providers.reduce((count, provider) => count + provider.models.length, 0));
    fireEvent.change(candidate, { target: { value: (options[1] as HTMLOptionElement).value } });
    fireEvent.change(screen.getByRole("combobox", { name: "Execution role" }), { target: { value: "xray_proxy" } });
    fireEvent.click(screen.getByRole("button", { name: "Inspect local draft" }));
    expect(screen.getByLabelText("Local routing draft")).toHaveTextContent('"enforcement": "not_applied"');
    expect(screen.getByLabelText("Local routing draft")).toHaveTextContent('"schemaTag": "proposed.tag"');
    expect(screen.getByLabelText("Local routing draft")).toHaveTextContent('"executionRole": "xray_proxy"');
    expect(selectRoute).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    navigate("Canvas");
    navigate("Schema routing");
    expect(screen.getByLabelText("Schema tag")).toHaveValue("proposed.tag");
  });

  it("shows no graph assertions or semantic evidence by default", () => {
    mount();
    navigate("Compliance");
    const policy = screen.getByRole("region", { name: "Compliance mappings and evidence" });
    expect(within(policy).getByText("No graph response loaded")).toBeVisible();
    expect(within(policy).getByText("No source evidence loaded")).toBeVisible();
    expect(within(policy).getByText("Unverified · live adapter unavailable")).toBeVisible();
  });

  it("discards pending evidence text and draft history when the verified session changes", () => {
    function SwitchSession() {
      const { setChatContext } = useChatRuntime();
      return <button onClick={() => setChatContext({
        mode: "control_plane", session_id: "another-session", project_id: null,
        memory_namespace: "session/another-session/control_plane", read_only: false,
        effective_capabilities: [], allowed_agents: [], selected_agent: null,
      })}>Switch verified session</button>;
    }
    render(<JsonRenderProvider adapter={createLocalChatAdapter()}><SwitchSession /><Page /></JsonRenderProvider>);
    navigate("Accountability");
    const query = screen.getByLabelText("Ask about recent events");
    fireEvent.change(query, { target: { value: "Old session history" } });
    fireEvent.click(screen.getByRole("button", { name: "Prepare query" }));
    fireEvent.change(query, { target: { value: "Old pending query" } });
    fireEvent.click(screen.getByRole("button", { name: "Switch verified session" }));
    expect(screen.getByLabelText("Ask about recent events")).toHaveValue("");
    expect(screen.queryByText("Old session history")).not.toBeInTheDocument();
    expect(screen.queryByText("Old pending query")).not.toBeInTheDocument();
  });

  it("renders event, time and tool-call citations only when evidence is supplied", () => {
    render(<EventEvidenceCitation evidence={{ eventId: "event-test-7", occurredAt: "2026-09-30T12:00:00Z", toolCall: "plugin.method", excerpt: "Supplied test evidence" }} />);
    expect(screen.getByText("event-test-7")).toBeVisible();
    expect(screen.getByText("2026-09-30T12:00:00Z")).toBeVisible();
    expect(screen.getByText("plugin.method")).toBeVisible();
  });

  it("rejects invalid supplied compliance bundles rather than showing assertions", () => {
    render(<CompliancePanel evidence={{ registry: { generation: "invalid" } }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Evidence bundle rejected");
    expect(screen.getByText("No graph response loaded")).toBeVisible();
  });
});
