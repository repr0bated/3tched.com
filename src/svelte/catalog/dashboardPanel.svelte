<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { ChatCatalog } from "../../json-render/catalog/chat-catalog";
  let {
    props,
    children,
  }: BaseComponentProps<InferComponentProps<ChatCatalog, "dashboardPanel">> =
    $props();
</script>

<section class="db-ref db-ref-panel" data-tone={props.tone ?? "neutral"}>
  <header>
    <h2>{props.title}</h2>
    {#if props.subtitle}<p>{props.subtitle}</p>{/if}
  </header>
  {@render children?.()}
</section>
