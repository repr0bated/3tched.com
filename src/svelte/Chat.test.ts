import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import Chat from "./Chat.svelte";
import { ChatSession, type ChatRuntime } from "./chat-session";
import { createLocalChatAdapter } from "../chat/local-chat-adapter";
import type { ChatAdapter } from "../chat/chat-adapter";

afterEach(cleanup);

function setup() {
  const adapter = {
    ...createLocalChatAdapter(0),
    submit: vi
      .fn<ChatAdapter["submit"]>()
      .mockResolvedValue({
        message: { id: "reply", role: "agent", content: "Example answer" },
      }),
  };
  const runtime: ChatRuntime = {
    adapter,
    scopeKey: "local",
    context: null,
    route: { providerId: "local-lab", modelId: "atlas-compact" },
    modelLabel: "Atlas Compact",
    setCanvas: vi.fn(),
  };
  const session = new ChatSession();
  session.configure(runtime);
  render(Chat, { session, runtime });
  return { adapter, session };
}

describe("Svelte chat interactions", () => {
  it("supports Enter to send, Shift+Enter for multiline text, and IME composition", async () => {
    const { adapter } = setup();
    const input = screen.getByRole("textbox", { name: "Message" });
    await fireEvent.input(input, {
      target: { value: "First line\nSecond line" },
    });
    await fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    await fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(adapter.submit).not.toHaveBeenCalled();
    await fireEvent.keyDown(input, { key: "Enter" });
    await screen.findByText("Example answer");
    expect(adapter.submit).toHaveBeenCalledTimes(1);
    expect(adapter.submit.mock.calls[0][0].message).toBe(
      "First line\nSecond line",
    );
    expect(input).toHaveValue("");
  });

  it("sends a reference suggestion and resets the transcript with focus restored", async () => {
    const { adapter } = setup();
    await fireEvent.click(
      screen.getByRole("button", { name: "Storage dashboard" }),
    );
    await screen.findByText("Example answer");
    expect(adapter.submit.mock.calls[0][0].message).toBe("/ui-reference btrfs");
    await fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    await waitFor(() =>
      expect(screen.queryByText("Example answer")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveFocus();
  });
});
