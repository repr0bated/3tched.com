<script lang="ts">
  import { getStateContext, type BaseComponentProps } from "@json-render/svelte";
  import { getByPath, type InferComponentProps } from "@json-render/core";
  import type { ChatCatalog } from "../../json-render/catalog/chat-catalog";
  import { provideMenuBar, type MenuBarState } from "../shell-context";
  let { props, children }: BaseComponentProps<InferComponentProps<ChatCatalog, "menuBar">> = $props();
  const store = getStateContext();
  const state: MenuBarState = {
    get open() { return (getByPath(store.state, "/shell/openMenu") as string | null | undefined) ?? null; },
    set open(value) { store.set("/shell/openMenu", value); },
  };
  provideMenuBar(state);
  let bar: HTMLDivElement;

  function moveBetweenTriggers(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (!target.matches("[data-menu-trigger]")) return;
    const triggers = [...bar.querySelectorAll<HTMLElement>("[data-menu-trigger]")];
    const index = triggers.indexOf(target);
    const next =
      event.key === "ArrowRight" ? (index + 1) % triggers.length
      : event.key === "ArrowLeft" ? (index - 1 + triggers.length) % triggers.length
      : event.key === "Home" ? 0
      : event.key === "End" ? triggers.length - 1
      : null;
    if (next === null) return;
    event.preventDefault();
    if (state.open) state.open = triggers[next].dataset.menuTrigger ?? null;
    triggers[next].focus();
  }
</script>

<nav class="sc-menubar-nav" aria-label={props.label}>
  <div
    bind:this={bar}
    class="sc-menubar"
    role="menubar"
    tabindex="-1"
    aria-label={props.label}
    onkeydown={moveBetweenTriggers}
    onfocusout={(event) => {
      if (!bar.contains(event.relatedTarget as Node | null)) state.open = null;
    }}
  >
    {@render children?.()}
  </div>
</nav>
