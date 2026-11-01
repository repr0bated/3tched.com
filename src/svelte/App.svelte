<script lang="ts">
  import { onMount } from "svelte";
  import type { Spec } from "@json-render/core";
  import { connect, type Gate } from "./connect";
  import { createLocalChatAdapter } from "../chat/local-chat-adapter";
  import RuntimeHost from "./RuntimeHost.svelte";
  import SpecRenderer from "./SpecRenderer.svelte";

  // Approved catalog elements. The chatbot owns the canvas spec. The top bar
  // carries both session controls: mode (chatModeSelector) + model
  // (tchedRouterPicker); its handle collapses it upward without unmounting.
  // Unused in the demo build (picker removed); restore the header to bring it back.
  const modelSelectionSpec = {
    root: "session-controls",
    elements: {
      "session-controls": { type: "container", props: { className: "sc-session-controls" }, children: ["chat-mode", "model-picker"] },
      "chat-mode": { type: "chatModeSelector", props: {} },
      "model-picker": { type: "tchedRouterPicker", props: { className: null } },
    },
  } as Spec;

  // The sealed chat_router /chat surface purpose names the chat stack; draw its
  // chatbot from that purpose until the chatbot supplies its own canvas.
  const CHAT_PURPOSES = ["vite, svelte-kit, json-render, ai-sdk, chat-sdk", "chat-takeover"];
  const chatSurfaceSpec = {
    root: "chat",
    elements: {
      chat: { type: "antigravityChatContainer", props: { streamId: "chat", title: null, mode: "live", placeholder: null, workspace: false, active: false, open: { $bindState: "/chatOpen" } } },
    },
    state: { chatOpen: true },
  } as Spec;

  let gate = $state.raw<Gate>({ state: "resolving_identity" });
  let controller: AbortController | undefined;

  function retry() {
    controller?.abort();
    controller = new AbortController();
    const current = controller;
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

<div class="svelte-chat-app">
  {#if gate.state === "ready"}
    {#key gate.adapter}
      <RuntimeHost adapter={gate.adapter}>
        {#snippet children(runtime)}
          {#if CHAT_PURPOSES.includes(runtime.surfacePurposes["/chat"]) && runtime.canvasSpec}
            <main class="sc-canvas sc-takeover" aria-label="Chat interface">
              {#key runtime.renderRevision}<SpecRenderer spec={runtime.canvasSpec} />{/key}
            </main>
          {:else}
            <!-- Demo build: the model picker is removed; the model is preset (control-plane model). -->
            <main class="sc-canvas" aria-label="Interface canvas">
              {#if runtime.canvasSpec}
                {#key runtime.renderRevision}<SpecRenderer spec={runtime.canvasSpec} />{/key}
              {:else if CHAT_PURPOSES.includes(runtime.surfacePurposes["/chat"])}
                <SpecRenderer spec={chatSurfaceSpec} />
                {#if runtime.interfaceError}<p class="chat-error" role="alert">{runtime.interfaceError}</p>{/if}
              {:else}
                <p role="status">{runtime.interfaceError ?? "Planting the seed."}</p>
              {/if}
            </main>
          {/if}
        {/snippet}
      </RuntimeHost>
    {/key}
  {:else}
    <header class="sc-header" aria-label="Model selection">
      <p>Model selection</p>
    </header>
    <main class="sc-canvas" aria-label="Interface canvas">
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
