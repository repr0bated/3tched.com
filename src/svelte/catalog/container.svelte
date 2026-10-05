<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { ChatCatalog } from "../../json-render/catalog/chat-catalog";
  let {
    props,
    children,
  }: BaseComponentProps<InferComponentProps<ChatCatalog, "container">> =
    $props();
</script>

<div class={`catalog-stack ${props.className ?? ""}`}>
  {@render children?.()}
</div>
