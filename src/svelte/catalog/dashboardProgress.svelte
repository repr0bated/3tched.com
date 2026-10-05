<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { ChatCatalog } from "../../json-render/catalog/chat-catalog";
  let {
    props,
  }: BaseComponentProps<InferComponentProps<ChatCatalog, "dashboardProgress">> =
    $props();
</script>

<section class="db-ref db-ref-progress" aria-label={props.label}>
  <div><strong>{props.label}</strong><span>{props.value}%</span></div>
  <progress max="100" value={props.value}>{props.value}%</progress
  >{#if props.detail}<small>{props.detail}</small>{/if}
</section>
