<script lang="ts">
  import { untrack } from "svelte";
  import { getBoundProp, type BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps, Spec } from "@json-render/core";
  import type { ChatCatalog } from "../../json-render/catalog/chat-catalog";
  import SpecRenderer from "../SpecRenderer.svelte";
  let { props, bindings, emit }: BaseComponentProps<InferComponentProps<ChatCatalog, "generatedRegion">> = $props();
  const open = getBoundProp<boolean | null>(
    () => props.open,
    () => bindings?.open,
  );
  const collapsible = $derived(bindings?.open != null);
  const collapsed = $derived(collapsible && open.current === false);
  const bodyId = $props.id();
  const content = $derived(props.views?.[props.view] as { spec: Spec } | undefined);
  const status = $derived(props.status?.[props.view]);
  $effect(() => {
    if (!collapsed && !content && !status) untrack(() => emit("missing"));
  });
</script>

<div class="sc-region" class:sc-region--collapsed={collapsed}>
  {#if collapsible}
    <button
      type="button"
      class="sc-region-toggle"
      aria-expanded={!collapsed}
      aria-controls={bodyId}
      onclick={() => (open.current = collapsed)}
    >{collapsed ? "Menu" : "Collapse menu"}</button>
  {/if}
  <div id={bodyId} hidden={collapsed}>
    {#if content}
      <SpecRenderer spec={content.spec} />
    {:else if !status || status === "generating"}
      <p class="sc-region-status" role="status">Rendering {props.title ?? "region"}…</p>
    {:else}
      <div class="sc-region-status" role="alert">
        {status}
        <button type="button" onclick={() => emit("retry")}>Retry</button>
      </div>
    {/if}
  </div>
</div>
