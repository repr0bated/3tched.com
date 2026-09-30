/**
 * The chat mode the principal selects for this session (OD-65). The door
 * persists it per session; every memory call and every turn's recall binds
 * to it. Values come back from the door — nothing is decided here.
 */
import type { DoorClient } from "../grpc/door";

export const PROJECT_PLUGIN = "project";
export const CHAT_CONTEXT = "chat.context";
export const PROJECT_READ = "project.read";
export const NOTEBOOKLM_PLUGIN = "notebooklm";
export const NOTEBOOKLM_READ = "notebooklm.read";
export const NOTEBOOKLM_INVOKE = "notebooklm.invoke";

export type ChatMode = "personal" | "project" | "control_plane" | "accountability" | "notebook_lm" | "ui_render";

/** Personal memory always has a namespace. The interface opens on this one. */
export const DEFAULT_PERSONAL_NAMESPACE = "main";

const PERSONAL_NAMESPACE_NAME = /^[a-z0-9_-]{1,64}$/;

/** The named personal namespace in a door memory path, or empty when the path has none. */
export function personalSubspace(namespace: string): string {
  const marker = "/personal/";
  const at = namespace.lastIndexOf(marker);
  if (at < 0) return "";
  const name = namespace.slice(at + marker.length);
  return PERSONAL_NAMESPACE_NAME.test(name) ? name : "";
}

export const CHAT_MODES: Array<{ id: ChatMode; label: string; hint: string }> = [
  { id: "personal", label: "Personal", hint: "Your memory, in the main namespace unless you choose another" },
  { id: "project", label: "Project", hint: "A project you own or were invited to" },
  { id: "control_plane", label: "Control plane", hint: "Requires the control-plane grant" },
  { id: "accountability", label: "Accountability", hint: "Ledger view; memory is read-only" },
  { id: "notebook_lm", label: "NotebookLM", hint: "The selected notebook" },
  { id: "ui_render", label: "UI render", hint: "Explore candidate interfaces; no memory read or written" },
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

export interface NotebookSummary {
  id: string;
  title: string;
}

export interface NotebookSource {
  id: string;
  title: string;
}

export interface NotebookDetail {
  notebook_id: string;
  title: string;
  source_count: number;
  url: string;
  sources: NotebookSource[];
  emoji?: string | null;
}

/** The notebook titled wishlist is the default NotebookLM notebook. */
export function defaultNotebook(notebooks: NotebookSummary[]): NotebookSummary | undefined {
  return notebooks.find((notebook) => notebook.title.trim().toLowerCase() === "wishlist");
}

/** The notebook id persisted in a NotebookLM memory namespace, when one is selected. */
export function notebookIdFromNamespace(namespace: string): string | null {
  const marker = "/notebooklm/";
  const index = namespace.indexOf(marker);
  if (index < 0) return null;
  const id = namespace.slice(index + marker.length);
  return id && !id.includes("/") ? id : null;
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
  if (request.mode === "personal") {
    args.personal_namespace = request.personalNamespace || DEFAULT_PERSONAL_NAMESPACE;
  }
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

export async function listNotebooks(client: DoorClient): Promise<NotebookSummary[]> {
  const { result } = await client.call<{ notebooks: NotebookSummary[] }>(
    NOTEBOOKLM_PLUGIN,
    "notebook_list",
    {},
    NOTEBOOKLM_READ,
  );
  return (result.notebooks ?? []).filter((notebook) => notebook.id);
}

export async function selectNotebook(client: DoorClient, notebookId: string): Promise<void> {
  await client.call(
    NOTEBOOKLM_PLUGIN,
    "select_notebook",
    { notebook_id: notebookId },
    NOTEBOOKLM_INVOKE,
  );
}

export async function getNotebook(client: DoorClient, notebookId: string): Promise<NotebookDetail> {
  const { result } = await client.call<NotebookDetail>(
    NOTEBOOKLM_PLUGIN,
    "notebook_get",
    { notebook_id: notebookId },
    NOTEBOOKLM_READ,
  );
  return {
    ...result,
    sources: result.sources ?? [],
  };
}
