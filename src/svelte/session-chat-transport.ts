import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import type { ChatSession } from "./chat-session";

function messageText(message: UIMessage): string {
  return message.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("");
}

function replyStream(text: string): ReadableStream<UIMessageChunk> {
  const id = "reply";
  const chunks: UIMessageChunk[] = [
    { type: "start" },
    { type: "text-start", id },
    { type: "text-delta", id, delta: text },
    { type: "text-end", id },
    { type: "finish" },
  ];
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

/** Door replies stay on the session; only the latest user turn is sent. */
export function sessionChatTransport(current: () => ChatSession): ChatTransport<UIMessage> {
  return {
    async sendMessages({ messages }) {
      const session = current();
      const latestUser = messages.findLast((message) => message.role === "user");
      const text = latestUser ? messageText(latestUser) : "";
      if (!text.trim()) throw new Error("The chat message had no text to send.");
      await session.submit(text);
      if (session.current.error) throw new Error(session.current.error);
      const reply = session.current.messages.findLast((message) => message.role === "agent");
      return replyStream(reply?.content ?? "");
    },
    async reconnectToStream() {
      return null;
    },
  };
}
