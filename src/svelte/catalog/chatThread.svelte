<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { ChatCatalog } from "../../json-render/catalog/chat-catalog";
  let {
    ..._props
  }: BaseComponentProps<InferComponentProps<ChatCatalog, "chatThread">> =
    $props();

  import { onMount } from "svelte";
  import { getSession } from "../session-context";
  const session = getSession();
  let messages = $state.raw(session?.current.messages ?? []);
  onMount(() =>
    session?.subscribe(() => {
      messages = session.current.messages;
    }),
  );
</script>

<div class="message-thread">
  {#each messages as message (message.id)}<article
      class={`message message--${message.role}`}
    >
      <p class="message__role">
        {message.role === "agent" ? "assistant" : message.role}
      </p>
      <p>{message.content}</p>
    </article>{/each}
</div>
