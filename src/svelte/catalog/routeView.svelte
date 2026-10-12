<script lang="ts">
  import { untrack } from "svelte";
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps, Spec } from "@json-render/core";
  import type { ChatCatalog } from "../../json-render/catalog/chat-catalog";
  import { CHAT_VIEW } from "../../json-render/navigation/manifest";
  import SpecRenderer from "../SpecRenderer.svelte";
  let { props, emit }: BaseComponentProps<InferComponentProps<ChatCatalog, "routeView">> = $props();

  const showing = $derived(props.view !== CHAT_VIEW);
  const views = $derived(Object.entries((props.views ?? {}) as Record<string, { spec: Spec; note?: string }>));
  const current = $derived(props.view ? (props.views?.[props.view] as { spec: Spec; note?: string } | undefined) : undefined);
  const status = $derived(props.view ? props.status?.[props.view] : undefined);

  $effect(() => {
    if (showing && props.view && !current && !status) untrack(() => emit("missing"));
  });
</script>

<section class="sc-route-view" aria-label={props.title ?? "View"} hidden={!showing}>
  {#each views as [id, view] (id)}
    <div class="sc-route-layer" hidden={id !== props.view}>
      <SpecRenderer spec={view.spec} />
      {#if view.note}<p class="sc-route-note">{view.note}</p>{/if}
    </div>
  {/each}
  {#if showing && !props.view}
    <p class="sc-route-status" role="status">There is no page at this address.</p>
  {:else if showing && !current}
    {#if !status || status === "generating" || status === "restoring" || status === "waiting"}
      <p class="sc-route-status" role="status">{status === "waiting"
        ? "Waiting for the chat session and an applied model…"
        : status === "restoring" ? `Restoring ${props.title ?? "view"}…`
        : `Generating ${props.title ?? "view"}…`}</p>
    {:else}
      <div class="sc-route-status" role="alert">
        <p>{status}</p>
        <button type="button" onclick={() => emit("retry")}>Retry</button>
      </div>
    {/if}
  {/if}
</section>
