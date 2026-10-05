<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { ChatCatalog } from "../../json-render/catalog/chat-catalog";
  let { props }: BaseComponentProps<InferComponentProps<ChatCatalog, "stat">> =
    $props();
</script>

<div class="canvas-stat">
  <span>{props.label}</span><strong>{props.value}</strong><small
    >{props.trend
      ? { up: "↑", down: "↓", flat: "→" }[props.trend]
      : ""}{props.unit ? ` ${props.unit}` : ""}</small
  >
</div>
