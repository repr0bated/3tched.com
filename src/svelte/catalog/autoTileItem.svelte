<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { ChatCatalog } from "../../json-render/catalog/chat-catalog";
  let {
    props,
    children,
  }: BaseComponentProps<InferComponentProps<ChatCatalog, "autoTileItem">> =
    $props();
</script>

<div
  class={`auto-tile-content ${props.className ?? ""}`}
  data-tile-id={props.tileId ?? undefined}
  data-size={props.size ?? "medium"}
>
  {@render children?.()}
</div>
