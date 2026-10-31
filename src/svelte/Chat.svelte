<script lang="ts">
  import { onMount, tick, untrack } from "svelte";
  import { ChatSession, type ChatRuntime } from "./chat-session";

  let {
    session,
    runtime,
  }: {
    session: ChatSession;
    runtime: ChatRuntime;
  } = $props();
  let thread = $state.raw(untrack(() => session.current));
  let viewport: HTMLDivElement;
  let input: HTMLTextAreaElement;
  let stickToBottom = $state(true);
  let showScrollButton = $state(false);
  let copied = $state<string | null>(null);
  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  const ready = $derived(runtime.adapter.kind === "local" || !!runtime.context);

  onMount(() => {
    const unsubscribe = session.subscribe(() => {
      thread = session.current;
    });
    thread = session.current;
    return () => {
      unsubscribe();
      clearTimeout(copyTimer);
    };
  });

  function trackScroll() {
    const atBottom =
      viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 80;
    stickToBottom = atBottom;
    showScrollButton = !atBottom;
  }

  function scrollToBottom() {
    stickToBottom = true;
    showScrollButton = false;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
  }

  $effect(() => {
    const count = thread.messages.length;
    const pending = thread.sending;
    if (viewport && stickToBottom && (count || pending)) {
      void tick().then(() => {
        if (viewport) viewport.scrollTop = viewport.scrollHeight;
      });
    }
  });

  $effect(() => {
    if (runtime.scopeKey) {
      stickToBottom = true;
      showScrollButton = false;
    }
  });

  async function send() {
    stickToBottom = true;
    await session.submit();
    input?.focus();
  }

  async function copyMessage(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = id;
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => (copied = null), 2000);
    } catch {
      copied = "failed";
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      void send();
    }
  }
</script>

<section class="sc-conversation" aria-label="Conversation">
  <div class="sc-thread-toolbar">
    {#if runtime.modelLabel}<span>{runtime.modelLabel}</span>{/if}
    {#if thread.messages.length}
      <button
        class="sc-button"
        disabled={thread.sending}
        title="Clear the visible transcript. The server session is retained."
        onclick={() => {
          session.clear();
          input.focus();
        }}
      >
        {runtime.adapter.kind === "local" ? "Start over" : "Clear view"}
      </button>
    {/if}
  </div>
  <!-- Keyboard users need a focusable scroll container to read earlier messages. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="sc-messages"
    bind:this={viewport}
    onscroll={trackScroll}
    role="region"
    aria-label="Messages"
    tabindex="0"
  >
      <div
        class="sc-thread"
        role="log"
        aria-label="Conversation messages"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {#each thread.messages as message (message.id)}
          <article
            class="sc-message"
            class:sc-message--user={message.role === "user"}
            aria-label={message.role === "agent"
              ? "Assistant message"
              : `${message.role} message`}
          >
            {#if message.role !== "user"}<div class="sc-message-label">
                <span aria-hidden="true">✳</span>{message.role === "agent"
                  ? "3tched"
                  : "System"}
              </div>{/if}
            <p class="sc-message-text">{message.content}</p>
            {#if message.canvasSpec || message.canvasSpecs?.length}
              <p class="sc-canvas-note">Interface rendered on the canvas</p>
            {/if}
            {#if message.role === "agent"}
              <div class="sc-message-actions">
                <button
                  onclick={() => void copyMessage(message.id, message.content)}
                  >{copied === message.id ? "Copied" : "Copy response"}</button
                >
              </div>
            {/if}
          </article>
        {/each}
        {#if thread.sending}<div class="sc-thinking">
            <span aria-hidden="true">✳</span>Thinking<span
              class="sc-dots"
              aria-hidden="true">…</span
            >
          </div>{/if}
      </div>
  </div>
  <footer class="sc-composer-area">
    {#if showScrollButton && thread.messages.length}<button
        class="sc-scroll-button"
        aria-label="Scroll to bottom"
        onclick={scrollToBottom}>↓</button
      >{/if}
    {#if thread.error}<p class="sc-error" role="alert">{thread.error}</p>{/if}
    <form
      class="sc-composer"
      onsubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <label class="sr-only" for="svelte-chat-message">Message</label>
      <textarea
        id="svelte-chat-message"
        bind:this={input}
        value={thread.draft}
        oninput={(event) => session.setDraft(event.currentTarget.value)}
        onkeydown={handleKeydown}
        disabled={!ready}
        placeholder="Message"
        rows="2"></textarea>
      <div class="sc-composer-bottom">
        {#if runtime.adapter.kind === "local" || runtime.context}<span
          >{runtime.adapter.kind === "local"
            ? "Local preview"
            : runtime.context?.mode.replaceAll("_", " ")}</span
        >{/if}
        <button
          type="submit"
          aria-label={thread.sending ? "Sending" : "Send"}
          disabled={!ready || !thread.draft.trim() || thread.sending}
          >{thread.sending ? "···" : "↑"}</button
        >
      </div>
    </form>
    <p class="sc-composer-hint">
      Enter to send <span>·</span> Shift + Enter for a new line
    </p>
    <p class="sr-only" role="status" aria-live="polite">
      {thread.sending
        ? "Waiting for a response."
        : (thread.saveStatus ??
          (copied === "failed" ? "Could not copy the response." : "Ready."))}
    </p>
  </footer>
</section>
