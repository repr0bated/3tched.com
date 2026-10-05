<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { ChatCatalog } from "../../json-render/catalog/chat-catalog";
  let {
    props,
  }: BaseComponentProps<InferComponentProps<ChatCatalog, "chatMessage">> =
    $props();
</script>

<article class={`message message--${props.role}`}>
  <p class="message__role">
    {props.role === "agent" ? "assistant" : props.role}
  </p>
  <p>{props.content}</p>
</article>
