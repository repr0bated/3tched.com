<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { ChatCatalog } from "../../json-render/catalog/chat-catalog";
  let { props }: BaseComponentProps<InferComponentProps<ChatCatalog, "text">> =
    $props();
</script>

<p class={`canvas-copy ${props.className ?? ""}`}>{props.text}</p>
