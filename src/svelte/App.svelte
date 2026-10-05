<script lang="ts">
  import { onMount, tick } from "svelte";
  import { connect, type Gate } from "./connect";
  import { createLocalChatAdapter } from "../chat/local-chat-adapter";
  import RuntimeHost from "./RuntimeHost.svelte";
  import Chat from "./Chat.svelte";
  import ModeStrip from "./ModeStrip.svelte";
  import ModelPicker from "./ModelPicker.svelte";
  import KnowledgeStrip from "./KnowledgeStrip.svelte";
  import Workspace from "./Workspace.svelte";
  let gate = $state.raw<Gate>({ state: "resolving_identity" });
  let settingsOpen = $state(false),
    workspaceOpen = $state(false),
    workspaceToggle = $state<HTMLButtonElement>();
  let controller: AbortController | undefined;
  function retry() {
    controller?.abort();
    const current = new AbortController();
    controller = current;
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
  function backToChat() {
    workspaceOpen = false;
    void tick().then(() =>
      document.getElementById("svelte-chat-message")?.focus(),
    );
  }
</script>

<div class="svelte-chat-app">
  <header class="sc-header">
    <div class="sc-brand">
      <span class="sc-logo" aria-hidden="true">✳</span>
      <h1>3tched <span>Chat</span></h1>
    </div>
    <div class="sc-header-actions">
      {#if gate.state === "ready"}<span class="sc-connection"
          ><i></i>{gate.adapter.kind === "local"
            ? "Local preview"
            : "Connected"}</span
        ><button
          class="sc-button"
          aria-expanded={settingsOpen}
          aria-controls="chat-settings"
          onclick={() => (settingsOpen = !settingsOpen)}>Settings</button
        ><button
          class="sc-button"
          bind:this={workspaceToggle}
          aria-expanded={workspaceOpen}
          aria-controls="chat-workspace"
          onclick={() => (workspaceOpen = !workspaceOpen)}>Workspace</button
        >{/if}
    </div>
  </header>
  {#if gate.state === "ready"}
    {#key gate.adapter}<RuntimeHost adapter={gate.adapter}
        >{#snippet children(runtime, session)}
          <KnowledgeStrip adapter={runtime.adapter} />
          <div id="chat-settings" class="sc-settings" hidden={!settingsOpen}>
            <ModeStrip
              adapter={runtime.adapter}
              onContextChange={runtime.setChatContext}
            />{#key runtime.scopeKey}<ModelPicker />{/key}
          </div>
          <div
            class="sc-body"
            class:sc-body--workspace={workspaceOpen}
            data-layout={runtime.layout}
          >
            <Chat {session} runtime={runtime.snapshot()} />
            <aside
              id="chat-workspace"
              class="sc-workspace"
              aria-label="Canvas workspace"
              hidden={!workspaceOpen}
            >
              <div class="sc-workspace-heading">
                <h2>Workspace</h2>
                <button
                  class="sc-button"
                  onclick={() => {
                    workspaceOpen = false;
                    workspaceToggle?.focus();
                  }}
                  aria-label="Close workspace">Close</button
                >
              </div>
              <Workspace {backToChat} />
            </aside>
          </div>
        {/snippet}</RuntimeHost
      >{/key}
  {:else if gate.state === "connect"}
    <main class="chat-only-page">
      <section class="door-connect" aria-labelledby="door-title">
        <h1 id="door-title">
          {gate.phase === "catalog"
            ? "Models unavailable"
            : "Connect to the door"}
        </h1>
        <p>
          {gate.phase === "catalog"
            ? "Your identity credential was obtained, but the provider list could not be loaded. Retry to try again."
            : "Your server supplies your identity automatically. Retry to reconnect using your registered session."}
        </p>
        {#if gate.error}<p class="chat-error" role="alert">{gate.error}</p>{/if}
        <div class="door-connect__actions">
          <button onclick={retry}>Retry connection</button><button
            class="door-connect__secondary"
            onclick={() => {
              controller?.abort();
              gate = { state: "ready", adapter: createLocalChatAdapter() };
            }}>Use local workbench</button
          >
        </div>
        <p class="sr-only" aria-live="polite" aria-atomic="true">
          {gate.phase === "catalog"
            ? "The provider list is unavailable. Retry to load models."
            : "Connection unavailable. Retry to resolve your identity from the server."}
        </p>
      </section>
    </main>
  {:else}<main class="chat-only-page">
      <p class="door-resolving" role="status" aria-live="polite">
        {gate.state === "resolving_identity"
          ? "Resolving your identity…"
          : "Loading available models…"}
      </p>
    </main>{/if}
</div>
