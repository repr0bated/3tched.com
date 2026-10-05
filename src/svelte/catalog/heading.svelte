<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { ChatCatalog } from "../../json-render/catalog/chat-catalog";
  let {
    props,
  }: BaseComponentProps<InferComponentProps<ChatCatalog, "heading">> = $props();
</script>

{#if props.level === 3}<h4 class="canvas-heading canvas-heading--small">
    {props.text}
  </h4>{:else}<h3
    class="canvas-heading"
    class:canvas-heading--large={props.level === 1}
  >
    {props.text}
  </h3>{/if}
