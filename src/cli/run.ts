import type { ChatMessage, ChatRequest, ChatResponse, ProviderOption, RouteSelection } from "../chat/chat-adapter";
import type { NotebookDetail, NotebookSummary, ProjectSummary, ResolvedChatContext, SelectModeRequest } from "../chat/chat-mode";
import type { CatalogEntrySummary, CandidateSummary, Page } from "../chat/ui-gallery";
import type { CliInvocation } from "./args";

/** The door adapter surface the command uses. Tests supply a fake. */
export interface CliSession {
  providers: ProviderOption[];
  committedRoute: RouteSelection | null;
  selectRoute(selection: RouteSelection): Promise<RouteSelection>;
  submit(request: ChatRequest): Promise<ChatResponse>;
  getChatContext(): Promise<ResolvedChatContext>;
  selectChatMode(request: SelectModeRequest): Promise<ResolvedChatContext>;
  listProjects(): Promise<ProjectSummary[]>;
  listNotebooks(): Promise<NotebookSummary[]>;
  selectNotebook(notebookId: string): Promise<void>;
  getNotebook(notebookId: string): Promise<NotebookDetail>;
  gallery: {
    listCandidates(before?: string | null, limit?: number): Promise<Page<CandidateSummary>>;
    listCatalog(before?: string | null, limit?: number, includeRetired?: boolean): Promise<Page<CatalogEntrySummary>>;
  };
  controlPlane: { current(): Promise<RouteSelection> };
}

export interface CliIo {
  write(text: string): void;
  readTranscript(path: string): Promise<ChatMessage[]>;
  writeTranscript(path: string, messages: ChatMessage[]): Promise<void>;
}

function print(io: CliIo, json: boolean, value: unknown, text: string): void {
  io.write(json ? `${JSON.stringify(value, null, 2)}\n` : text);
}

function providersText(providers: ProviderOption[]): string {
  if (providers.length === 0) return "No provider is configured.\n";
  return providers.map((provider) => {
    const models = provider.models.map((model) => `  ${model.id}${model.detail ? `  ${model.detail}` : ""}`).join("\n");
    return models ? `${provider.id}\n${models}` : provider.id;
  }).join("\n") + "\n";
}

function routeText(route: RouteSelection | null): string {
  if (!route) return "No catalog route is committed.\n";
  return `${route.providerId}  ${route.modelId}\n`;
}

/** Run one parsed command against an open session. */
export async function dispatch(invocation: CliInvocation, session: CliSession, io: CliIo): Promise<number> {
  const { command } = invocation;
  switch (command.name) {
    case "help":
      return 0;
    case "providers":
      print(io, invocation.json, session.providers, providersText(session.providers));
      return 0;
    case "route":
      print(io, invocation.json, session.committedRoute, routeText(session.committedRoute));
      return 0;
    case "route-apply": {
      const applied = await session.selectRoute({ providerId: command.providerId, modelId: command.modelId });
      print(io, invocation.json, applied, routeText(applied));
      return 0;
    }
    case "context": {
      const context = await session.getChatContext();
      print(io, invocation.json, context, `${context.mode}  ${context.memory_namespace}${context.read_only ? "  read-only" : ""}\n`);
      return 0;
    }
    case "mode": {
      const context = await session.selectChatMode({
        mode: command.mode,
        projectId: command.projectId,
        personalNamespace: command.namespace,
      });
      print(io, invocation.json, context, `${context.mode}  ${context.memory_namespace}\n`);
      return 0;
    }
    case "projects": {
      const projects = await session.listProjects();
      print(io, invocation.json, projects, projects.map((project) => `${project.project_id}  ${project.title}  ${project.status}`).join("\n") + (projects.length ? "\n" : "No projects.\n"));
      return 0;
    }
    case "notebooks": {
      const notebooks = await session.listNotebooks();
      print(io, invocation.json, notebooks, notebooks.map((notebook) => `${notebook.id}  ${notebook.title}`).join("\n") + (notebooks.length ? "\n" : "No notebooks.\n"));
      return 0;
    }
    case "notebook": {
      const notebook = await session.getNotebook(command.id);
      print(io, invocation.json, notebook, `${notebook.title}  ${notebook.source_count} source(s)\n${notebook.sources.map((source) => `  ${source.id}  ${source.title}`).join("\n")}\n`);
      return 0;
    }
    case "notebook-select":
      await session.selectNotebook(command.id);
      await session.selectChatMode({ mode: "notebook_lm" });
      io.write(invocation.json ? `${JSON.stringify({ notebookId: command.id, mode: "notebook_lm" })}\n` : `notebook ${command.id}  notebook_lm\n`);
      return 0;
    case "chat": {
      const history = invocation.transcript ? await io.readTranscript(invocation.transcript) : [];
      const route = command.providerId && command.modelId
        ? await session.selectRoute({ providerId: command.providerId, modelId: command.modelId })
        : session.committedRoute ?? { providerId: "", modelId: "" };
      const message = command.message;
      const response = await session.submit({ message, history, route, mode: command.mode });
      const next = [
        ...history,
        { id: `user-${history.length}`, role: "user" as const, content: command.message },
        response.message,
      ];
      if (invocation.transcript) await io.writeTranscript(invocation.transcript, next);
      print(io, invocation.json, { message: response.message }, `${response.message.content}\n`);
      return 0;
    }
    case "control-plane": {
      const current = await session.controlPlane.current();
      print(io, invocation.json, current, routeText(current));
      return 0;
    }
    case "candidates": {
      const page = await session.gallery.listCandidates();
      print(io, invocation.json, page.items, page.items.map((item) => `${item.candidate_id}  ${item.mode}  ${item.title}`).join("\n") + (page.items.length ? "\n" : "No saved canvases.\n"));
      return 0;
    }
    case "compositions": {
      const page = await session.gallery.listCatalog();
      print(io, invocation.json, page.items, page.items.map((item) => `${item.entry_id}  ${item.status}  ${item.name}`).join("\n") + (page.items.length ? "\n" : "No promoted compositions.\n"));
      return 0;
    }
    case "mcp":
      throw new Error("MCP is served directly over stdio.");
    default:
      return 2;
  }
}
