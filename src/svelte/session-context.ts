import { getContext, setContext } from "svelte";
import type { ChatSession } from "./chat-session";
const key = Symbol("chat-session");
export function provideSession(session: ChatSession) {
  setContext(key, session);
}
export function getSession() {
  return getContext<ChatSession>(key);
}
