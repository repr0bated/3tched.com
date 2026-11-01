<script lang="ts">
  import { Chat, type UIMessage } from "@ai-sdk/svelte";
  import { ChatSession, type ChatRuntime } from "./chat-session";
  import { sessionChatTransport } from "./session-chat-transport";

  let {
    session,
    runtime,
  }: {
    session: ChatSession;
    runtime: ChatRuntime;
  } = $props();

  let draft = $state("");
  const chat = new Chat({
    transport: sessionChatTransport(() => session),
  });

  const ready = $derived(runtime.adapter.kind === "local" || !!runtime.context);
  const busy = $derived(chat.status === "submitted" || chat.status === "streaming");
  const clearLabel = $derived(runtime.adapter.kind === "local" ? "Start over" : "Clear view");
  const statusLabel = $derived(
    runtime.adapter.kind === "local"
      ? "Local preview"
      : (runtime.context?.mode.replaceAll("_", " ") ?? ""),
  );
  const showsCanvas = $derived(
    session.current.messages.some(
      (message) => message.canvasSpec || message.canvasSpecs?.length,
    ),
  );

  function textOf(message: UIMessage): string {
    return message.parts
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("");
  }

  async function send() {
    const text = draft;
    if (!ready || busy || !text.trim()) return;
    draft = "";
    await chat.sendMessage({ text });
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    void send();
  }

  function clear(event: MouseEvent) {
    session.clear();
    chat.messages = [];
    chat.clearError();
    const field = (event.currentTarget as HTMLElement)
      .closest("section")
      ?.querySelector<HTMLTextAreaElement>("#svelte-chat-message");
    field?.focus();
  }
</script>

<section class="sc-conversation" aria-label="Conversation">
  <div class="sc-thread-toolbar">
    {#if runtime.modelLabel}<span>{runtime.modelLabel}</span>{:else}<span></span>{/if}
    {#if chat.messages.length > 0}
      <button
        type="button"
        disabled={busy}
        title="Clear the visible transcript. The server session is retained."
        onclick={clear}
      >{clearLabel}</button>
    {/if}
  </div>
  <div class="sc-messages">
    {#if chat.messages.length === 0 && !busy}
      <div class="sc-empty">
        <h2>Start a conversation</h2>
        <p>Type a message below to begin chatting</p>
      </div>
    {:else}
      <div class="sc-thread">
        {#each chat.messages as message, index (message.id)}
          <article class="sc-message" class:sc-message--user={message.role === "user"}>
            <p class="sc-message-text">{textOf(message)}</p>
            {#if showsCanvas && message.role === "assistant" && index === chat.messages.length - 1}
              <p class="sc-canvas-note">Interface rendered on the canvas</p>
            {/if}
          </article>
        {/each}
        {#if busy}<p class="sc-thinking" aria-hidden="true">Thinking…</p>{/if}
      </div>
    {/if}
  </div>
  <form
    class="sc-composer-area"
    onsubmit={(event) => {
      event.preventDefault();
      void send();
    }}
  >
    {#if chat.error}<p class="sc-error" role="alert">{chat.error.message}</p>{/if}
    <div class="sc-composer">
      <textarea
        id="svelte-chat-message"
        aria-label="Message"
        placeholder="Message"
        bind:value={draft}
        disabled={!ready}
        onkeydown={onKeydown}
      ></textarea>
      <div class="sc-composer-bottom">
        <span>{statusLabel}</span>
        <button
          type="submit"
          aria-label={busy ? "Sending" : "Send"}
          disabled={!ready || busy || !draft.trim()}>↑</button
        >
      </div>
    </div>
    <p class="sc-composer-hint">Enter to send · Shift + Enter for a new line</p>
  </form>
  <p class="sr-only" role="status" aria-live="polite">
    {busy ? "Waiting for a response." : "Ready."}
  </p>
</section>
