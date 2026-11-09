import type { ChatTransport, UIMessage } from "ai";
import type { ChatSession } from "./chat-session";
/** Door replies stay on the session; only the latest user turn is sent. */
export function sessionChatTransport(current: () => ChatSession): ChatTransport<UIMessage> {
  return {
    async sendMessages({ messages }) {
      const session = current();
      const scope = session.scopeKey;
      const latestUser = messages.findLast((message) => message.role === "user");
      const text = latestUser ? latestUser.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("") : "";
      if (!text.trim()) throw new Error("The chat message had no text to send.");
      await session.submit(text);
      if (session.scopeKey !== scope) {
        const id = "reply";
        return new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "start" });
            controller.enqueue({ type: "start-step" });
            controller.enqueue({ type: "text-start", id });
            controller.enqueue({ type: "text-delta", id, delta: "" });
            controller.enqueue({ type: "text-end", id });
            controller.enqueue({ type: "finish-step" });
            controller.enqueue({ type: "finish" });
            controller.close();
          },
        });
      }
      if (session.current.error) throw new Error(session.current.error);
      const reply = session.current.messages.findLast((message) => message.role === "agent");
      const id = "reply";
      return new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "start" });
          controller.enqueue({ type: "start-step" });
          controller.enqueue({ type: "text-start", id });
          controller.enqueue({ type: "text-delta", id, delta: reply?.content ?? "" });
          controller.enqueue({ type: "text-end", id });
          controller.enqueue({ type: "finish-step" });
          controller.enqueue({ type: "finish" });
          controller.close();
        },
      });
    },
    async reconnectToStream() {
      return null;
    },
  };
}
