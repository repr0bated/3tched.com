import type { ResolvedChatContext } from "./chat-mode";
/** The door's resolved session scope is the authority for both thread and Canvas. */
export function chatScopeKey(
  context: ResolvedChatContext | null,
  remote: boolean,
): string {
  if (!remote) return "local";
  if (!context) return "awaiting-door";
  return encodeURIComponent(
    JSON.stringify([
      context.session_id,
      context.mode,
      context.project_id,
      context.memory_namespace,
    ]),
  );
}

export function chatMessagesPath(streamId: string, scopeKey: string): string {
  return `/streams/${streamId}/scopes/${scopeKey}/messages`;
}
