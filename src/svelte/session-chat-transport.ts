import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import { Message, toAiMessages } from "chat";
import type { ChatSession } from "./chat-session";

function messageText(message: UIMessage): string {
  return message.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("");
}

function chatSdkMessage(message: UIMessage, index: number): Message {
  const assistant = message.role === "assistant";
  return new Message({
    id: message.id,
    threadId: "chat",
    text: messageText(message),
    formatted: { type: "root", children: [] },
    raw: {},
    attachments: [],
    author: {
      userId: assistant ? "assistant" : "user",
      userName: assistant ? "assistant" : "user",
      fullName: assistant ? "Assistant" : "User",
      isBot: assistant,
      isMe: assistant,
    },
    metadata: { dateSent: new Date(index), edited: false },
  });
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

/** Door replies stay on the session. The Chat SDK converts the turn before that call. */
export function sessionChatTransport(current: () => ChatSession): ChatTransport<UIMessage> {
  return {
    async sendMessages({ messages }) {
      const session = current();
      const converted = await toAiMessages(messages.map(chatSdkMessage));
      const latestUser = converted.findLast((message) => message.role === "user");
      const text = typeof latestUser?.content === "string" ? latestUser.content : "";
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
