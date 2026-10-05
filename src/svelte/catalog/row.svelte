<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { ChatCatalog } from "../../json-render/catalog/chat-catalog";
  let {
    props,
    children,
  }: BaseComponentProps<InferComponentProps<ChatCatalog, "row">> = $props();
</script>

<div class={`canvas-row ${props.className ?? ""}`}>{@render children?.()}</div>
