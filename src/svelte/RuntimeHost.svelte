<script lang="ts">
  import "../workbench/workbench.css";
  import { onDestroy, onMount, untrack, type Snippet } from "svelte";
  import type { ChatAdapter } from "../chat/chat-adapter";
  import { emptyFeedSnapshot, type FeedSnapshot } from "../grpc/plugin-feeds";
  import { Runtime, provideRuntime } from "./runtime.svelte";
  import { ChatSession } from "./chat-session";
  import { provideSession } from "./session-context";
  import { providePluginFeeds } from "./plugin-feeds";
  let {
    adapter,
    children,
  }: { adapter: ChatAdapter; children: Snippet<[Runtime, ChatSession]> } =
    $props();
  const runtime = new Runtime(untrack(() => adapter));
  const session = new ChatSession();
  const feeds = untrack(() => adapter.pluginFeeds);
  let snapshot = $state.raw<FeedSnapshot>(emptyFeedSnapshot());
  if (feeds) providePluginFeeds(() => snapshot);
  provideRuntime(runtime);
  provideSession(session);
  session.configure(untrack(() => runtime.snapshot()));
  onMount(() => {
    if (runtime.adapter.catalogRefreshOnMount) void runtime.refreshProviders();
  });
  $effect(() => {
    session.configure(runtime.snapshot());
  });
  $effect(() => {
    if (!feeds) return;
    const write = () => {
      snapshot = feeds.getSnapshot();
    };
    write();
    const unsubscribe = feeds.subscribe(write);
    const release = feeds.acquire();
    return () => {
      unsubscribe();
      release();
      snapshot = emptyFeedSnapshot();
    };
  });
  const feedMessage = $derived.by(() => {
    const status = snapshot.status;
    if (status.state === "idle") return "";
    const rows = Object.values(snapshot.plugins).filter((feed) => !feed.removed);
    const available = rows.filter((feed) => feed.stateStatus === "available").length;
    if (status.state === "live") {
      return `Live plugin feeds: ${rows.length} contracts, ${available} current state projections`;
    }
    if (status.state === "connecting") return "Connecting plugin feeds…";
    const label = status.state === "reconnecting" ? "Reconnecting plugin feeds" : "Plugin feeds unavailable";
    return `${label}: ${status.message}`;
  });
  onDestroy(() => {
    session.dispose();
    runtime.dispose();
  });
</script>

{#if feedMessage}<aside role="status" aria-label="Plugin feed status">{feedMessage}</aside>{/if}
{@render children(runtime, session)}
