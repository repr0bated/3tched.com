<script lang="ts">
  import { onMount } from "svelte";
  import type { Spec } from "@json-render/core";
  import { connect, type Gate } from "./connect";
  import { createLocalChatAdapter } from "../chat/local-chat-adapter";
  import RuntimeHost from "./RuntimeHost.svelte";
  import SpecRenderer from "./SpecRenderer.svelte";

  // Approved catalog elements. The chatbot owns the canvas spec. The collapsing
  // top menu holds model selection (tchedRouterPicker). The mode selector lives
  // in the chatbot composer. The sealed chat_router /chat UiSurface purpose
  // draws the chatbot in a collapsing drawer while the chatbot renders onto the
  // canvas.
  const modelSelectionSpec = {
    root: "model-picker",
    elements: {
      "model-picker": { type: "tchedRouterPicker", props: { className: null } },
    },
  } as Spec;

  const CHAT_PURPOSES = ["vite, svelte-kit, json-render, ai-sdk, chat-sdk", "chat-takeover"];
  const chatSurfaceSpec = {
    root: "chat",
    elements: {
      chat: {
        type: "antigravityChatContainer",
        props: {
          streamId: "chat",
          title: null,
          mode: "live",
          placeholder: null,
          workspace: false,
          active: false,
          open: { $bindState: "/chatOpen" },
        },
      },
    },
    state: { chatOpen: true },
  } as Spec;

  function specHasElement(spec: Spec | null, type: string): boolean {
    if (!spec?.elements) return false;
    return Object.values(spec.elements).some((el) => el?.type === type);
  }

  let menuOpen = $state(true);
  const chromeId = $props.id();
  const menuId = `${chromeId}-menu`;

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
          <main
            class="sc-canvas"
            class:sc-takeover={CHAT_PURPOSES.includes(runtime.surfacePurposes["/chat"]) && Boolean(runtime.canvasSpec)}
            aria-label="Interface canvas"
          >
            {#if runtime.canvasSpec}
              {#key runtime.renderRevision}<SpecRenderer spec={runtime.canvasSpec} />{/key}
            {:else if !CHAT_PURPOSES.includes(runtime.surfacePurposes["/chat"])}
              <p role="status">{runtime.interfaceError ?? "Planting the seed."}</p>
            {/if}
          </main>
          <div class="sc-chrome">
            {#if !specHasElement(runtime.canvasSpec, "tchedRouterPicker")}
              <header class="sc-header" class:sc-header--collapsed={!menuOpen} aria-label="Model">
                <button type="button" class="sc-header-toggle" aria-expanded={menuOpen} aria-controls={menuId} onclick={() => (menuOpen = !menuOpen)}>{menuOpen ? "Collapse menu" : "Menu"}</button>
                <div id={menuId} class="sc-header-controls" hidden={!menuOpen}>
                  <SpecRenderer spec={modelSelectionSpec} />
                </div>
              </header>
            {/if}
            {#if CHAT_PURPOSES.includes(runtime.surfacePurposes["/chat"]) && !specHasElement(runtime.canvasSpec, "antigravityChatContainer")}
              <SpecRenderer spec={chatSurfaceSpec} />
            {/if}
          </div>
        {/snippet}
      </RuntimeHost>
    {/key}
  {:else}
    <header class="sc-header" aria-label="Connection">
      <p>Connecting</p>
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
