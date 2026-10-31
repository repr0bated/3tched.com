<script lang="ts">
  import { tick, type Snippet } from "svelte";
  import { getBoundProp, type BaseComponentProps } from "@json-render/svelte";
  let { props, children, emit, bindings }: BaseComponentProps<{ panel: "chat" | "models"; title: string; collapsed: boolean }> & { children?: Snippet } = $props();
  let dialog: HTMLDialogElement;
  let trigger: HTMLButtonElement;
  const boundCollapsed = getBoundProp<boolean>(() => props.collapsed, () => bindings?.collapsed);
  let localCollapsed = $state(props.collapsed);
  const collapsed = $derived(bindings?.collapsed ? boundCollapsed.current : localCollapsed);
  async function open() {
    localCollapsed = false;
    if (bindings?.collapsed) boundCollapsed.current = false;
    await tick();
    if (!dialog.open) dialog.showModal();
    emit("open");
  }
  function close() {
    localCollapsed = true;
    if (bindings?.collapsed) boundCollapsed.current = true;
    dialog.close();
    trigger?.focus();
    emit("close");
  }
  $effect(() => {
    if (!dialog) return;
    if (collapsed) dialog.close();
    else if (!dialog.open) dialog.showModal();
  });
</script>
<button bind:this={trigger} class="application-overlay-toggle" class:models={props.panel === "models"} aria-expanded={!collapsed} onclick={open}>{props.title}</button>
<dialog bind:this={dialog} aria-label={props.title} oncancel={(event) => { event.preventDefault(); close(); }}>
  <header><h2>{props.title}</h2><button onclick={close} aria-label={`Close ${props.title}`}>Close</button></header>
  {#if children}{@render children()}{/if}
</dialog>
<style>
  .application-overlay-toggle { position: fixed; right: 1rem; bottom: 1rem; z-index: 50; }
  .application-overlay-toggle.models { bottom: 4rem; }
  dialog { width: min(42rem, calc(100vw - 2rem)); max-height: calc(100dvh - 2rem); overflow: auto; color: inherit; background: var(--background, #171717); border: 1px solid currentColor; border-radius: .5rem; padding: 1rem; }
  dialog::backdrop { background: rgb(0 0 0 / .45); }
  header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
  button:focus-visible { outline: 3px solid currentColor; outline-offset: 3px; }
</style>
