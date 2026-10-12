<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { connect, type Gate } from "./connect";
  import { createLocalChatAdapter } from "../chat/local-chat-adapter";
  import RuntimeHost from "./RuntimeHost.svelte";
  import Shell from "./Shell.svelte";
  import type { ShellNavigation } from "./shell-context";
  let {
    route: routeProp,
    navigation: navigationProp,
  }: { route?: string; navigation?: ShellNavigation } = $props();
  // Without SvelteKit's router (tests, embedded use), navigation stays in memory.
  let localRoute = $state("/");
  const route = $derived(routeProp ?? localRoute);
  const navigation: ShellNavigation = untrack(() => navigationProp) ?? {
    href: (path) => path,
    navigate: (path) => (localRoute = path),
  };
  let gate = $state.raw<Gate>({ state: "resolving_identity" });
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
</script>

<svelte:head><title>3tched</title></svelte:head>

<div class="svelte-chat-app">
  {#if gate.state === "ready"}
    {#key gate.adapter}
      <RuntimeHost adapter={gate.adapter}>
        <div class="sc-body">
          <Shell {route} {navigation} />
        </div>
      </RuntimeHost>
    {/key}
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
