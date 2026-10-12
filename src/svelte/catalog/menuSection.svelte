<script lang="ts">
  import { onDestroy } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { ChatCatalog } from "../../json-render/catalog/chat-catalog";
  import { getMenuBar, getShellNavigation, provideMenuSection, type MenuBarState } from "../shell-context";
  let { props, children }: BaseComponentProps<InferComponentProps<ChatCatalog, "menuSection">> = $props();
  const standalone = $state<MenuBarState>({ open: null });
  const bar = getMenuBar() ?? standalone;
  const navigation = getShellNavigation();
  const routes = new SvelteSet<string>();
  provideMenuSection({ routes });
  const menuId = $props.id();
  const open = $derived(bar.open === props.id);
  const active = $derived(!!navigation?.current && routes.has(navigation.current()));
  let trigger: HTMLButtonElement;
  let menu: HTMLDivElement;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;

  const items = () => [...menu.querySelectorAll<HTMLElement>("[role=menuitem]:not([aria-disabled=true])")];
  function show() {
    clearTimeout(closeTimer);
    bar.open = props.id;
  }
  function hideSoon() {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      if (bar.open === props.id) bar.open = null;
    }, 150);
  }
  function close(refocus: boolean) {
    clearTimeout(closeTimer);
    if (bar.open === props.id) bar.open = null;
    if (refocus) trigger.focus();
  }
  function focusItem(which: "first" | "last") {
    show();
    queueMicrotask(() => {
      const list = items();
      (which === "first" ? list[0] : list[list.length - 1])?.focus();
    });
  }
  function triggerKey(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
      event.preventDefault();
      focusItem("first");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusItem("last");
    } else if (event.key === "Escape") {
      close(true);
    }
  }
  function menuKey(event: KeyboardEvent) {
    const list = items();
    const index = list.indexOf(event.target as HTMLElement);
    const next =
      event.key === "ArrowDown" ? (index + 1) % list.length
      : event.key === "ArrowUp" ? (index - 1 + list.length) % list.length
      : event.key === "Home" ? 0
      : event.key === "End" ? list.length - 1
      : null;
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (next !== null && list.length) {
      event.preventDefault();
      list[next].focus();
    }
  }
  onDestroy(() => clearTimeout(closeTimer));
</script>

<div
  class="sc-menu-section"
  class:sc-menu-section--active={active}
  role="none"
  onpointerenter={show}
  onpointerleave={hideSoon}
>
  <button
    bind:this={trigger}
    type="button"
    role="menuitem"
    data-menu-trigger={props.id}
    aria-haspopup="menu"
    aria-expanded={open}
    aria-controls={menuId}
    onclick={() => (open ? close(false) : show())}
    onkeydown={triggerKey}>{props.label}</button
  >
  <div
    bind:this={menu}
    id={menuId}
    class="sc-menu"
    role="menu"
    tabindex="-1"
    aria-label={props.label}
    hidden={!open}
    onkeydown={menuKey}
    onclick={() => close(false)}
  >
    {@render children?.()}
  </div>
</div>
