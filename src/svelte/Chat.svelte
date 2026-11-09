<script lang="ts">
  import { untrack } from "svelte";
  import { Chat, type UIMessage } from "@ai-sdk/svelte";
  import { ChatSession, type ChatRuntime, type ThreadMessage } from "./chat-session";
  import { sessionChatTransport } from "./session-chat-transport";
  import ModeStrip from "./ModeStrip.svelte";
  import SpecRenderer from "./SpecRenderer.svelte";
  import { tryGetRuntime } from "./runtime.svelte";

  let {
    session,
    runtime,
    showModes = true,
  }: {
    session: ChatSession;
    runtime: ChatRuntime;
    showModes?: boolean;
  } = $props();

  // The live runtime applies a mode change; the snapshot prop only reads it.
  const live = tryGetRuntime();
  let draft = $state("");
  let shownScope = "";
  let threadError = $state<string | null>(null);
  let thread = $state.raw(untrack(() => session.current));
  const chat = new Chat({
    transport: sessionChatTransport(() => session),
  });

  function toUi(message: ThreadMessage): UIMessage {
    return {
      id: message.id,
      role: message.role === "user" ? "user" : "assistant",
      parts: [{ type: "text", text: message.content }],
    };
  }

  $effect(() => {
    thread = session.current;
    threadError = thread.error;
    return session.subscribe(() => {
      thread = session.current;
      threadError = thread.error;
    });
  });
  $effect(() => {
    if (!live) return;
    const scope = live.scopeKey;
    const apply = () => {
      if (session.scopeKey !== scope || scope === shownScope) return;
      shownScope = scope;
      threadError = session.current.error;
      untrack(() => {
        chat.clearError();
        if (chat.status === "submitted" || chat.status === "streaming") void chat.stop();
        chat.messages = session.current.messages.map(toUi);
      });
    };
    apply();
    return session.subscribe(apply);
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
    thread.messages.some(
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
    <span class="sc-model">Model selected by server</span>
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
    {#if thread.messages.length === 0 && !busy}
      <div class="sc-empty">
        <h2>Start a conversation</h2>
        <p>Type a message below to begin chatting</p>
      </div>
    {:else}
      <div class="sc-thread">
        {#each thread.messages as message, index (message.id)}
          <article class="sc-message" class:sc-message--user={message.role === "user"}>
            {#if message.role === "user"}
              <p class="sc-message-text">{message.content}</p>
            {:else}
              {#if message.execution}
                <p class="sc-execution">Tracked {message.execution.tool} · {message.execution.status} · {message.execution.id}</p>
              {/if}
              {#if message.canvasSpec}
                <SpecRenderer spec={message.canvasSpec} />
              {/if}
              <p class="sc-message-text">{message.content}</p>
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
    {#if threadError}<p class="sc-error" role="alert">{threadError}</p>{/if}
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
        {#if showModes && runtime.adapter.kind === "remote" && live?.chatContext}
          <div class="sc-composer-mode">
            <ModeStrip adapter={runtime.adapter} initialContext={live.chatContext} onContextChange={live.setChatContext} />
          </div>
        {:else}
          <span>{statusLabel}</span>
        {/if}
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
