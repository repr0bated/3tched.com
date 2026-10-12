<script lang="ts">
  import Chat from "../Chat.svelte";
  import Workspace from "../Workspace.svelte";
  import { getRuntime } from "../runtime.svelte";
  import { getSession } from "../session-context";
  import { getBoundProp, type BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { ChatCatalog } from "../../json-render/catalog/chat-catalog";
  let {
    props,
    bindings,
  }: BaseComponentProps<
    InferComponentProps<ChatCatalog, "antigravityChatContainer">
  > = $props();
  const runtime = getRuntime(),
    session = getSession();
  const open = getBoundProp<boolean | null>(
    () => props.open,
    () => bindings?.open,
  );
  const bodyId = $props.id();
  const docked = $derived(props.active === false);
  const collapsed = $derived(docked && !open.current);
</script>

<div
  class="sc-chat-layer"
  class:sc-chat-layer--docked={docked}
  class:sc-chat-layer--collapsed={collapsed}
>
  {#if docked}<button
      type="button"
      class="sc-chat-toggle"
      aria-expanded={!collapsed}
      aria-controls={bodyId}
      onclick={() => (open.current = collapsed)}
      >{collapsed ? "Chat" : "Collapse chat"}</button
    >{/if}
  <div id={bodyId} class="sc-chat-body" hidden={collapsed}>
    <Chat
      {session}
      runtime={runtime.snapshot()}
    />{#if props.workspace !== false}<Workspace
        navigation={false}
        backToChat={() => document.getElementById("svelte-chat-message")?.focus()}
      />{/if}
  </div>
</div>
