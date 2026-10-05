<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { ChatCatalog } from "../../json-render/catalog/chat-catalog";
  let {
    props,
  }: BaseComponentProps<InferComponentProps<ChatCatalog, "dashboardStatus">> =
    $props();
</script>

<div class="db-ref db-ref-status" data-tone={props.tone} role="status">
  <strong>{props.label}</strong>{#if props.detail}<span>{props.detail}</span
    >{/if}
</div>
