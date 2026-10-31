<script lang="ts">
  import { onMount } from "svelte";
  import type { Spec } from "@json-render/core";
  import { connect, type Gate } from "./connect";
  import { createLocalChatAdapter } from "../chat/local-chat-adapter";
  import RuntimeHost from "./RuntimeHost.svelte";
  import SpecRenderer from "./SpecRenderer.svelte";

  // Approved catalog elements. The chatbot owns the canvas spec. Header
  // carries both session controls: mode (chatModeSelector) + model
  // (tchedRouterPicker). Both are catalog components, no hand-rolled UI.
  const modelSelectionSpec = {
    root: "session-controls",
    elements: {
      "session-controls": { type: "container", props: { className: "sc-session-controls" }, children: ["chat-mode", "model-picker"] },
      "chat-mode": { type: "chatModeSelector", props: {} },
      "model-picker": { type: "tchedRouterPicker", props: { className: null } },
    },
  } as Spec;

  let gate = $state.raw<Gate>({ state: "resolving_identity" });
  let rendered = $state(false);
  let controller: AbortController | undefined;

  function retry() {
    controller?.abort();
    controller = new AbortController();
    const current = controller;
    rendered = false;
    gate = { state: "resolving_identity" };
    void connect(current.signal, () => {
      if (!current.signal.aborted) gate = { state: "loading_catalog" };
    }).then((next) => {
      if (!current.signal.aborted) gate = next;
    });
  }

  onMount(() => {
    retry();
    return () => controller?.abort();
  });
</script>

<div class="svelte-chat-app" class:sc-loading-page={!rendered}>
  {#if !rendered}
    <p class="sc-loading-hello">Hi.</p>
    <aside class="sc-loading-chat" aria-label="Chatbot">
      <p>This is where the chatbot will be.</p>
    </aside>
  {/if}
  {#if gate.state === "ready"}
    {#key gate.adapter}
      <RuntimeHost adapter={gate.adapter} onCanvas={(present) => (rendered = present)}>
        {#snippet children(runtime)}
          <header class="sc-header">
            <SpecRenderer spec={modelSelectionSpec} />
          </header>
          <main class="sc-canvas" aria-label="Interface canvas">
            {#if runtime.canvasSpec}
              {#key runtime.renderRevision}<SpecRenderer spec={runtime.canvasSpec} />{/key}
            {:else}
              <p class="sc-loading-canvas">This is where the canvas will be.</p>
              <p role="status">{runtime.interfaceError ?? "Planting the seed."}</p>
            {/if}
          </main>
        {/snippet}
      </RuntimeHost>
    {/key}
  {:else}
    <header class="sc-header" aria-label="Model selection">
      <p>Model selection</p>
    </header>
    <main class="sc-canvas" aria-label="Interface canvas">
      <p class="sc-loading-canvas">This is where the canvas will be.</p>
      <p class="sr-only" role="status">Loading.</p>
      {#if gate.state === "connect"}
        <section class="door-connect" aria-labelledby="door-title">
          <h1 id="door-title">{gate.phase === "catalog" ? "Models unavailable" : "Connect to the door"}</h1>
          <p>
            {gate.phase === "catalog"
              ? "Your identity credential was obtained, but the provider list could not be loaded. Retry to try again."
              : "Your server supplies your identity automatically. Retry to reconnect using your registered session."}
          </p>
          {#if gate.error}<p class="chat-error" role="alert">{gate.error}</p>{/if}
          <div class="sc-connect-actions">
            <button type="button" class="sc-button" onclick={retry}>Retry connection</button>
            <button type="button" class="sc-button" onclick={() => { controller?.abort(); gate = { state: "ready", adapter: createLocalChatAdapter() }; }}>Use local workbench</button>
          </div>
        </section>
      {/if}
    </main>
  {/if}
</div>
