<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { ChatCatalog } from "../../json-render/catalog/chat-catalog";
  import { getMenuSection, getShellNavigation } from "../shell-context";
  let { props }: BaseComponentProps<InferComponentProps<ChatCatalog, "menuItem">> = $props();
  const navigation = getShellNavigation();
  const section = getMenuSection();
  const current = $derived(!!props.route && navigation?.current?.() === props.route);
  $effect(() => {
    const route = props.route;
    if (!route || !section) return;
    section.routes.add(route);
    return () => section.routes.delete(route);
  });
</script>

{#if props.placeholder || !props.route}
  <span class="sc-menu-item" role="menuitem" aria-disabled="true" tabindex="-1">{props.label}</span>
{:else}
  {@const route = props.route}
  <a
    class="sc-menu-item"
    role="menuitem"
    tabindex="-1"
    href={navigation?.href(route) ?? route}
    aria-current={current ? "page" : undefined}
    onclick={(event) => {
      if (!navigation || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigation.navigate(route);
    }}
    >{props.label}{#if props.wip}<span class="sc-menu-wip">WIP</span>{/if}</a
  >
{/if}
