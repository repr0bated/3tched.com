<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { ChatCatalog } from "../../json-render/catalog/chat-catalog";
  let { props }: BaseComponentProps<InferComponentProps<ChatCatalog, "badge">> =
    $props();
</script>

<span class={`canvas-badge canvas-badge--${props.tone ?? "default"}`}
  >{props.text ?? props.label}</span
>
