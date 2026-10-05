<script lang="ts">
  import { untrack } from "svelte";
  import type { ChatAdapter } from "../chat/chat-adapter";
  import type { DoorChatAdapter } from "../chat/door-chat-adapter";
  import type { DoorbellStatus } from "../chat/doorbell";
  import type { KnowledgePush } from "../chat/knowledge-feed";
  let { adapter }: { adapter: ChatAdapter } = $props();
  let pushes = $state.raw<KnowledgePush[]>([]),
    status = $state.raw<DoorbellStatus | null>(null);
  $effect(() => {
    pushes = [];
    status = null;
    const remote = adapter as DoorChatAdapter;
    if (adapter.kind !== "remote" || !remote.followKnowledge) return;
    let alive = true;
    const stop = untrack(() =>
      remote.followKnowledge(
        (fresh) => {
          if (alive) pushes = [...fresh, ...pushes].slice(0, 50);
        },
        (value) => {
          if (alive) status = value;
        },
      ),
    );
    return () => {
      alive = false;
      stop();
    };
  });
  function summary(push: KnowledgePush) {
    if (typeof push.content === "string") return push.content;
    const content = push.content as Record<string, unknown> | null;
    for (const field of [
      "session_overview",
      "usage_tips",
      "resolution_steps",
      "suggested_next_steps",
    ]) {
      const value = content?.[field];
      if (typeof value === "string" && value.trim()) return value;
      if (Array.isArray(value) && typeof value[0] === "string") return value[0];
    }
    return push.trigger_reason;
  }
  function readable(value: string) {
    const words = value
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/_/g, " ")
      .trim();
    return words
      ? words[0].toUpperCase() + words.slice(1).toLowerCase()
      : value;
  }
</script>

{#if pushes.length || status?.state === "closed"}
  <aside class="knowledge-strip" aria-label="Knowledge for this session">
    <header>
      <span>Knowledge</span>{#if status && status.state !== "subscribed"}<span
          class="knowledge-strip__status"
          role="status"
          >{status.state === "connecting"
            ? "Connecting…"
            : status.retryInMs === null
              ? `Disconnected: ${status.reason}`
              : `Reconnecting… ${status.reason}`}</span
        >{/if}
    </header>
    <ul>
      {#each pushes.slice(0, 5) as push, index (index)}<li
          title={push.trigger_reason}
        >
          <span class="knowledge-strip__trigger">{readable(push.trigger)}</span>
          {summary(push)}{#if push.suggested_action}<span
              class="knowledge-strip__suggestion"
            >
              Suggestion: {readable(push.suggested_action)}.</span
            >{/if}
        </li>{/each}
    </ul>
  </aside>
{/if}
