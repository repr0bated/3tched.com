<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import ChatApp from "../../svelte/App.svelte";
  import type { ShellNavigation } from "../../svelte/shell-context";
  import "../../styles.css";
  import "../../svelte/chat.css";

  // One route for every menu path, so the shell (and the chat in it) stays mounted between pages.
  // Menu routes are runtime data matched by this catch-all, not typed route IDs.
  const resolvePath = resolve as unknown as (path: string) => string;
  const href = (route: string) => resolvePath(route.replace(/^\/+/, ""));
  const base = href("/").replace(/\/$/, "");
  const route = $derived(
    base && page.url.pathname.startsWith(base) ? page.url.pathname.slice(base.length) || "/" : page.url.pathname,
  );
  const navigation: ShellNavigation = {
    href,
    navigate: (target) => void goto(href(target)),
  };
</script>

<svelte:head>
  <meta name="description" content="3tched — SvelteKit chat with interactive Json Render results" />
</svelte:head>

<ChatApp {route} {navigation} />
