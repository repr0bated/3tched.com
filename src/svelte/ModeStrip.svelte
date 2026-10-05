<script lang="ts">
  import { onMount } from "svelte";
  import type { ChatAdapter } from "../chat/chat-adapter";
  import type { DoorChatAdapter } from "../chat/door-chat-adapter";
  import {
    CHAT_MODES,
    DEFAULT_PERSONAL_NAMESPACE,
    defaultNotebook,
    notebookIdFromNamespace,
    personalSubspace,
    type ChatMode,
    type NotebookSummary,
    type ProjectSummary,
    type ResolvedChatContext,
  } from "../chat/chat-mode";
  let {
    adapter,
    onContextChange,
  }: {
    adapter: ChatAdapter;
    onContextChange?: (context: ResolvedChatContext) => void;
  } = $props();
  let remote = $derived(
    adapter.kind === "remote" && "selectChatMode" in adapter
      ? (adapter as DoorChatAdapter)
      : null,
  );
  let context = $state.raw<ResolvedChatContext | null>(null);
  let projects = $state.raw<ProjectSummary[]>([]),
    notebooks = $state.raw<NotebookSummary[]>([]);
  let projectListError = $state<string | null>(null),
    notebookListError = $state<string | null>(null),
    error = $state<string | null>(null);
  let projectPending = $state(false),
    notebookPending = $state(false),
    busy = $state(false),
    loading = $state(true);
  let namespaces = $state<string[]>([]),
    naming = $state(false),
    draft = $state(""),
    nameError = $state<string | null>(null);
  let lastPersonal = DEFAULT_PERSONAL_NAMESPACE;
  let alive = true,
    generation = 0,
    ensuredMain = false;
  const storageKey = "3tched.personal-namespaces";
  function stored() {
    try {
      const data: unknown = JSON.parse(
        localStorage.getItem(storageKey) ?? "[]",
      );
      return Array.isArray(data)
        ? data.filter(
            (name): name is string =>
              typeof name === "string" &&
              personalSubspace(`/personal/${name}`) === name,
          )
        : [];
    } catch {
      return [];
    }
  }
  function remember(name: string) {
    namespaces = [...new Set([DEFAULT_PERSONAL_NAMESPACE, ...stored(), name])];
    try {
      localStorage.setItem(storageKey, JSON.stringify(namespaces));
    } catch {
      /* Namespace preferences are optional. */
    }
  }
  function accept(selected: ResolvedChatContext) {
    const name = personalSubspace(selected.memory_namespace);
    if (name) {
      lastPersonal = name;
      remember(name);
    }
    context = selected;
    onContextChange?.(selected);
    projectPending = false;
    notebookPending = false;
  }
  async function select(
    mode: ChatMode,
    projectId?: string,
    personalNamespace?: string,
    notebookId?: string,
  ) {
    if (!remote || busy || !alive) return;
    busy = true;
    error = null;
    notebookPending = false;
    const token = ++generation;
    try {
      if (notebookId) {
        await remote.selectNotebook(notebookId);
        if (!alive || token !== generation) return;
      }
      const selected = await remote.selectChatMode({
        mode,
        projectId,
        personalNamespace,
      });
      if (alive && token === generation) accept(selected);
    } catch (e) {
      if (alive && token === generation)
        error = e instanceof Error ? e.message : "selection refused";
    } finally {
      if (alive && token === generation) busy = false;
    }
  }
  function chooseDefault() {
    const notebook = defaultNotebook(notebooks);
    if (notebookPending && notebook && !busy)
      void select("notebook_lm", undefined, undefined, notebook.id);
  }
  async function loadProjects() {
    if (!remote) return;
    try {
      const list = await remote.listProjects();
      if (alive) {
        projects = list;
        projectListError = null;
      }
    } catch {
      if (alive) projectListError = "Projects unavailable.";
    }
  }
  async function loadNotebooks() {
    if (!remote?.listNotebooks) return;
    try {
      const list = await remote.listNotebooks();
      if (alive) {
        notebooks = list;
        notebookListError = null;
        chooseDefault();
      }
    } catch {
      if (alive) notebookListError = "Notebooks unavailable.";
    }
  }
  async function loadContext() {
    if (!remote) return;
    loading = true;
    error = null;
    const token = ++generation;
    try {
      let selected = await remote.getChatContext();
      if (!alive || token !== generation) return;
      if (
        selected.mode === "personal" &&
        !personalSubspace(selected.memory_namespace) &&
        !ensuredMain
      ) {
        ensuredMain = true;
        try {
          selected = await remote.selectChatMode({
            mode: "personal",
            personalNamespace: DEFAULT_PERSONAL_NAMESPACE,
          });
        } catch (e) {
          if (alive && token === generation)
            error = e instanceof Error ? e.message : "selection refused";
        }
      }
      if (alive && token === generation) accept(selected);
    } catch (e) {
      if (alive && token === generation)
        error = e instanceof Error ? e.message : "mode unavailable";
    } finally {
      if (alive && token === generation) loading = false;
    }
  }
  onMount(() => {
    namespaces = stored();
    void loadContext();
    void loadProjects();
    void loadNotebooks();
    return () => {
      alive = false;
      generation++;
    };
  });
  let current = $derived(CHAT_MODES.find((m) => m.id === context?.mode));
  let readyProjects = $derived(projects.filter((p) => p.status === "ready"));
  let notebookId = $derived(
    context?.mode === "notebook_lm"
      ? notebookIdFromNamespace(context.memory_namespace)
      : null,
  );
  function chooseMode(mode: ChatMode) {
    if (mode === "project" && context?.mode !== "project") {
      projectPending = true;
      notebookPending = false;
      error = null;
    } else if (mode === "notebook_lm" && context?.mode !== "notebook_lm") {
      notebookPending = true;
      projectPending = false;
      error = null;
      chooseDefault();
    } else {
      projectPending = false;
      notebookPending = false;
      void select(
        mode,
        undefined,
        mode === "personal" ? lastPersonal : undefined,
      );
    }
  }
  function focusName(node: HTMLInputElement) {
    node.focus();
  }
</script>

{#if remote}
  <section class="mode-strip" aria-label="Chat mode">
    {#if !context}
      {#if loading}<span role="status" aria-live="polite"
          >Loading chat mode…</span
        >{:else}<span class="mode-strip__error" role="alert"
          >{error ?? "Chat mode unavailable."}</span
        ><button onclick={() => void loadContext()}>Retry chat mode</button
        >{/if}
    {:else}
      <label
        >Mode<select
          value={projectPending
            ? "project"
            : notebookPending
              ? "notebook_lm"
              : context.mode}
          disabled={busy}
          onchange={(e) => {
            chooseMode(e.currentTarget.value as ChatMode);
            e.currentTarget.value = projectPending
              ? "project"
              : notebookPending
                ? "notebook_lm"
                : context!.mode;
          }}
          >{#each CHAT_MODES as mode (mode.id)}<option
              value={mode.id}
              title={mode.hint}>{mode.label}</option
            >{/each}</select
        ></label
      >
      {#if projectPending || context.mode === "project"}
        <label
          >Project<select
            value={projectPending ? "" : (context.project_id ?? "")}
            disabled={busy}
            onchange={(e) => {
              void select("project", e.currentTarget.value);
              e.currentTarget.value = projectPending
                ? ""
                : (context!.project_id ?? "");
            }}
            ><option value="" disabled>Choose a project</option
            >{#each readyProjects as project (project.project_id)}<option
                value={project.project_id}>{project.title}</option
              >{/each}{#if context.project_id && !readyProjects.some((p) => p.project_id === context?.project_id)}<option
                value={context.project_id}
                >Current project ({context.project_id})</option
              >{/if}</select
          ></label
        >
      {/if}
      {#if notebookPending || context.mode === "notebook_lm"}
        <label
          >Notebook<select
            value={notebookPending ? "" : (notebookId ?? "")}
            disabled={busy}
            onchange={(e) => {
              void select(
                "notebook_lm",
                undefined,
                undefined,
                e.currentTarget.value,
              );
              e.currentTarget.value = notebookId ?? "";
            }}
            ><option value="" disabled
              >{notebooks.length
                ? "Choose a notebook"
                : "No notebooks available"}</option
            >{#each notebooks as notebook (notebook.id)}<option
                value={notebook.id}>{notebook.title || notebook.id}</option
              >{/each}{#if notebookId && !notebooks.some((n) => n.id === notebookId)}<option
                value={notebookId}>Current notebook ({notebookId})</option
              >{/if}</select
          ></label
        >
      {/if}
      {#if context.mode === "personal"}
        <label
          >Namespace<select
            value={personalSubspace(context.memory_namespace) ||
              DEFAULT_PERSONAL_NAMESPACE}
            disabled={busy}
            onchange={(e) => {
              if (e.currentTarget.value === "__new__") {
                draft = "";
                nameError = null;
                naming = true;
              } else void select("personal", undefined, e.currentTarget.value);
              e.currentTarget.value =
                personalSubspace(context!.memory_namespace) ||
                DEFAULT_PERSONAL_NAMESPACE;
            }}
            >{#each [...new Set([DEFAULT_PERSONAL_NAMESPACE, ...namespaces, personalSubspace(context.memory_namespace)].filter(Boolean))] as name (name)}<option
                value={name}>{name}</option
              >{/each}<option value="__new__">New…</option></select
          ></label
        >
      {/if}
      {#if naming}
        <div
          class="namespace-prompt"
          role="dialog"
          tabindex="-1"
          aria-label="New namespace"
          onkeydown={(e) => {
            if (e.key === "Escape") naming = false;
          }}
        >
          <form
            onsubmit={(e) => {
              e.preventDefault();
              const name = draft.trim();
              if (!name || personalSubspace(`/personal/${name}`) !== name) {
                nameError = "Use 1 to 64 characters: a-z, 0-9, _ or -.";
                return;
              }
              remember(name);
              naming = false;
              void select("personal", undefined, name);
            }}
          >
            <p class="namespace-prompt__title">Name this namespace</p>
            <label
              >Name<input
                use:focusName
                bind:value={draft}
                disabled={busy}
              /></label
            >{#if nameError}<span role="alert">{nameError}</span>{/if}
            <div class="namespace-prompt__actions">
              <button type="submit" disabled={busy || !draft.trim()}>Add</button
              ><button type="button" onclick={() => (naming = false)}
                >Cancel</button
              >
            </div>
          </form>
        </div>
      {/if}
      <span class="mode-strip__namespace" title={current?.hint}
        >{context.mode === "ui_render"
          ? "no memory"
          : context.memory_namespace}{context.read_only &&
        context.mode !== "ui_render"
          ? " · read-only"
          : ""}</span
      >
      {#if projectPending}<span role="status"
          >Choose a project to enter Project mode; {current?.label} remains active.</span
        >{/if}
      {#if notebookPending}<span role="status"
          >Choose a notebook to enter NotebookLM mode; {current?.label} remains active.</span
        >{/if}
      {#if error}<span class="mode-strip__error" role="alert">{error}</span
        >{/if}
    {/if}
    {#if projectListError}<span role="alert">{projectListError}</span><button
        onclick={() => void loadProjects()}>Retry projects</button
      >{/if}
    {#if notebookListError}<span role="alert">{notebookListError}</span><button
        onclick={() => void loadNotebooks()}>Retry notebooks</button
      >{/if}
  </section>
{/if}
