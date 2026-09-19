/**
 * The chat mode the principal selects for this session (OD-65). The door
 * persists it per session; every memory call and every turn's recall binds
 * to it. Values come back from the door — nothing is decided here.
 */
import type { DoorClient } from "../grpc/door";

export const PROJECT_PLUGIN = "project";
export const CHAT_CONTEXT = "chat.context";
export const PROJECT_READ = "project.read";

export type ChatMode = "personal" | "project" | "control_plane" | "accountability" | "notebooklm" | "ui_render";

export const CHAT_MODES: Array<{ id: ChatMode; label: string; hint: string }> = [
  { id: "personal", label: "Personal", hint: "Your memory; optional named sub-space" },
  { id: "project", label: "Project", hint: "A project you own or were invited to" },
  { id: "control_plane", label: "Control plane", hint: "Requires the control-plane grant" },
  { id: "accountability", label: "Accountability", hint: "Ledger view; memory is read-only" },
  { id: "notebooklm", label: "NotebookLM", hint: "The selected notebook" },
  { id: "ui_render", label: "UI render", hint: "No memory read or written" },
];

export interface ResolvedChatContext {
  mode: ChatMode;
  session_id: string;
  project_id: string | null;
  memory_namespace: string;
  read_only: boolean;
  effective_capabilities: string[];
  allowed_agents: string[];
  selected_agent: string | null;
}

export interface ProjectSummary {
  project_id: string;
  title: string;
  status: string;
}

export interface SelectModeRequest {
  mode: ChatMode;
  projectId?: string;
  personalNamespace?: string;
}

export async function getChatContext(client: DoorClient): Promise<ResolvedChatContext> {
  const { result } = await client.call<ResolvedChatContext>(PROJECT_PLUGIN, "get_context", {}, CHAT_CONTEXT);
  return result;
}

export async function selectChatMode(client: DoorClient, request: SelectModeRequest): Promise<ResolvedChatContext> {
  const args: Record<string, unknown> = { mode: request.mode };
  if (request.mode === "project" && request.projectId) args.project_id = request.projectId;
  if (request.mode === "personal" && request.personalNamespace) args.personal_namespace = request.personalNamespace;
  const { result } = await client.call<ResolvedChatContext>(PROJECT_PLUGIN, "select_context", args, CHAT_CONTEXT);
  return result;
}

export async function listProjects(client: DoorClient): Promise<ProjectSummary[]> {
  const { result } = await client.call<{ projects: Array<{ project: ProjectSummary } | ProjectSummary> }>(
    PROJECT_PLUGIN,
    "list",
    {},
    PROJECT_READ,
  );
  return (result.projects ?? []).map((entry) => ("project" in entry ? entry.project : entry));
}
