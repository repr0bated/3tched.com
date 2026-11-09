import { describe, expect, it, vi } from "vitest";
import type { ChatSession } from "./chat-session";
import { sessionChatTransport } from "./session-chat-transport";

describe("sessionChatTransport", () => {
  it("streams the reply without inventing a tool call or execution receipt", async () => {
    const session = {
      scopeKey: "scope",
      current: { error: null, messages: [{ role: "agent", content: "Actual reply" }] },
      submit: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChatSession;
    const transport = sessionChatTransport(() => session);
    const stream = await transport.sendMessages({
      trigger: "submit-message",
      chatId: "chat",
      messageId: undefined,
      messages: [{ id: "user", role: "user", parts: [{ type: "text", text: "Hello" }] }],
      abortSignal: undefined,
    });
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    expect(session.submit).toHaveBeenCalledWith("Hello");
    expect(chunks).toContainEqual({ type: "text-delta", id: "reply", delta: "Actual reply" });
    expect(chunks.some((chunk) => chunk.type.startsWith("tool-"))).toBe(false);
  });
});
