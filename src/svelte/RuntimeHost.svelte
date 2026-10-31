<script lang="ts">
  import "../workbench/workbench.css";
  import { onDestroy, onMount, untrack, type Snippet } from "svelte";
  import type { ChatAdapter } from "../chat/chat-adapter";
  import type { ResolvedChatContext } from "../chat/chat-mode";
  import { emptyFeedSnapshot, type FeedSnapshot } from "../grpc/plugin-feeds";
  import { Runtime, provideRuntime } from "./runtime.svelte";
  import { ChatSession } from "./chat-session";
  import { provideSession } from "./session-context";
  import { providePluginFeeds } from "./plugin-feeds";
  let {
    adapter,
    children,
    onCanvas,
  }: {
    adapter: ChatAdapter;
    children: Snippet<[Runtime, ChatSession]>;
    onCanvas?: (present: boolean) => void;
  } = $props();
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
    // Track only the verified context, not state changed by the generation request.
    if (runtime.chatContext) untrack(() => void runtime.loadInterface());
  });
  $effect(() => {
    onCanvas?.(runtime.canvasSpec !== null);
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
  onMount(() => {
    const readContext = (adapter as ChatAdapter & { getChatContext?: () => Promise<ResolvedChatContext> }).getChatContext;
    if (!readContext) return;
    let alive = true;
    void readContext().then((context) => {
      if (alive) runtime.setChatContext(context);
    }).catch((error: unknown) => {
      if (alive) runtime.interfaceError = error instanceof Error ? error.message : "The chatbot could not be instigated.";
    });
    return () => { alive = false; };
  });
  onDestroy(() => {
    session.dispose();
    runtime.dispose();
  });
</script>

{@render children(runtime, session)}
