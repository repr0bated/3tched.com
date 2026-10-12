<script lang="ts">
  import { onDestroy, tick, untrack } from "svelte";
  import { SvelteMap } from "svelte/reactivity";
  import { JsonUIProvider, Renderer } from "@json-render/svelte";
  import { createStateStore } from "@json-render/core";
  import { chatRegistry } from "../json-render/catalog/chat-registry";
  import { containersPageSpec } from "../json-render/pages/containers.pagespec";
  import { createShellSpec } from "../json-render/pages/shell.pagespec";
  import { CHAT_VIEW, matchRoute, pagePrompt, visibleMenu, type RouteMatch } from "../json-render/navigation/manifest";
  import { getRuntime } from "./runtime.svelte";
  import { getSession } from "./session-context";
  import { provideShellNavigation, type ShellNavigation } from "./shell-context";
  import { readShellBookmarks, writeShellBookmarks, type ShellBookmarks } from "./shell-view-memory";

  let { route, navigation }: { route: string; navigation: ShellNavigation } = $props();
  const runtime = getRuntime();
  const session = getSession();
  const sections = $derived(visibleMenu(runtime.chatContext?.effective_capabilities));
  const spec = $derived(createShellSpec(sections));
  const match = $derived(matchRoute(route, sections));
  const ready = $derived(runtime.adapter.kind === "local" ||
    (runtime.chatContext !== null && (runtime.chatContext.mode === "control_plane" || runtime.routeConfirmed)));
  provideShellNavigation({
    href: (path) => navigation.href(path),
    navigate: (path) => navigation.navigate(path),
    current: () => match?.item.route ?? route,
  });

  const title = (found: RouteMatch | null) => (found ? `${found.section.label} · ${found.item.label}` : "Not found");
  const store = createStateStore({
    shell: { pages: {}, status: {}, chatOpen: true, openMenu: null, activeSection: null },
  });
  let currentScope: string | undefined;
  let bookmarks: ShellBookmarks = { views: {} };
  let epoch = 0;
  let alive = true;
  const requests = new SvelteMap<string, number>();

  function findPage(view: string): RouteMatch | null {
    for (const section of sections) {
      const item = section.items.find((entry) => entry.id === view);
      if (item) return { section, item };
    }
    return null;
  }

  function setStatus(view: string, value: string | null) {
    const { [view]: _previous, ...rest } = (store.get("/shell/status") ?? {}) as Record<string, string>;
    store.set("/shell/status", value === null ? rest : { ...rest, [view]: value });
  }

  $effect(() => {
    const scope = runtime.scopeKey;
    const found = match;
    const isReady = ready;
    const pathname = route;
    untrack(() => {
      if (currentScope !== scope) {
        currentScope = scope;
        epoch++;
        requests.clear();
        bookmarks = readShellBookmarks(scope);
        store.update({
          "/shell/pages": { containers: { spec: containersPageSpec } },
          "/shell/status": {},
        });
      }
      store.update({
        "/shell/route": found?.item.route ?? pathname,
        "/shell/view": found?.item.id ?? null,
        "/shell/title": title(found),
        "/shell/activeSection": found?.section.id ?? null,
        "/shell/openMenu": null,
      });
      if (isReady && pathname === "/") {
        const last = bookmarks.route ? matchRoute(bookmarks.route, sections) : null;
        navigation.navigate(last?.item.route ?? "/overview");
        return;
      }
      if (isReady && found?.item.route) {
        bookmarks.route = found.item.route;
        writeShellBookmarks(scope, bookmarks);
      }
      const view = found?.item.id;
      const pageEpoch = epoch;
      runtime.pageTarget = view && view !== CHAT_VIEW ? {
        id: view,
        accept: (canvas) => {
          if (!alive || currentScope !== scope || pageEpoch !== epoch) return;
          requests.set(view, (requests.get(view) ?? 0) + 1);
          store.set(`/shell/pages/${view}`, { spec: canvas });
          setStatus(view, null);
          // A new chat result replaces the old layout in this session. It is
          // not a saved candidate until the caller explicitly saves it.
          delete bookmarks.views[view];
          writeShellBookmarks(scope, bookmarks);
        },
      } : null;
      if (view && view !== CHAT_VIEW) {
        if (isReady) void generateView({ view });
        else if (!store.get(`/shell/pages/${view}`)) setStatus(view, "waiting");
      }
    });
  });

  async function generateView(params: Record<string, unknown>) {
    const view = typeof params.view === "string" ? params.view : null;
    if (!view || view === CHAT_VIEW || !ready || currentScope !== runtime.scopeKey) return;
    const page = findPage(view);
    if (!page?.item.route) return;
    const status = ((store.get("/shell/status") ?? {}) as Record<string, string>)[view];
    if (store.get(`/shell/pages/${view}`) || status === "generating" || status === "restoring" ||
      (status && status !== "waiting" && params.retry !== true)) return;
    const scope = currentScope;
    const requestEpoch = epoch;
    const request = (requests.get(view) ?? 0) + 1;
    requests.set(view, request);
    const candidateId = bookmarks.views[view];
    setStatus(view, candidateId ? "restoring" : "generating");
    const current = () => alive && epoch === requestEpoch && currentScope === scope && requests.get(view) === request;
    try {
      await tick();
      if (!current()) return;
      const result = candidateId
        ? await session.restoreView(candidateId, title(page))
        : await session.generateView(pagePrompt(page), title(page));
      if (!current()) return;
      store.set(`/shell/pages/${view}`, result);
      if (result.candidateId) {
        bookmarks.views[view] = result.candidateId;
        writeShellBookmarks(scope, bookmarks);
      }
      setStatus(view, null);
    } catch (error) {
      if (current()) setStatus(view, error instanceof Error ? error.message : "The view could not be rendered.");
    }
  }

  onDestroy(() => {
    alive = false;
    epoch++;
    runtime.pageTarget = null;
  });
</script>

<svelte:head><title>{title(match)} · 3tched</title></svelte:head>

<JsonUIProvider {store} handlers={{ generateView }}>
  <Renderer {spec} registry={chatRegistry} />
</JsonUIProvider>
