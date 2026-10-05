<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { ChatCatalog } from "../../json-render/catalog/chat-catalog";
  let {
    props,
  }: BaseComponentProps<InferComponentProps<ChatCatalog, "pageHeader">> =
    $props();
</script>

<header class="page-header">
  <h1>{props.title}</h1>
  {#if props.subtitle}<p>{props.subtitle}</p>{/if}
</header>
