<script lang="ts">
  import Chat from "../Chat.svelte";
  import Workspace from "../Workspace.svelte";
  import { getRuntime } from "../runtime.svelte";
  import { getSession } from "../session-context";
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { ChatCatalog } from "../../json-render/catalog/chat-catalog";
  let {
    props,
  }: BaseComponentProps<
    InferComponentProps<ChatCatalog, "antigravityChatContainer">
  > = $props();
  const runtime = getRuntime(),
    session = getSession();
</script>

<Chat
  {session}
  runtime={runtime.snapshot()}
/>{#if props.workspace !== false}<Workspace
    navigation={false}
    backToChat={() => document.getElementById("svelte-chat-message")?.focus()}
  />{/if}
