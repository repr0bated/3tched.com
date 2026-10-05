<script lang="ts">
  import { getRuntime } from "./runtime.svelte";
  import type { DoorChatAdapter } from "../chat/door-chat-adapter";
  import { notebookIdFromNamespace } from "../chat/chat-mode";
  import { notebookCanvasSpec } from "../json-render/references/canvas-contract";
  import { Elevation } from "./elevation.svelte";
  import { onDestroy } from "svelte";
  import SudoPrompt from "./SudoPrompt.svelte";
  import GalleryPanel from "./GalleryPanel.svelte";
  import WorkbenchNavigation from "./WorkbenchNavigation.svelte";
  import WorkbenchPanels from "./WorkbenchPanels.svelte";
  import AccountabilityEvidence from "./AccountabilityEvidence.svelte";
  import SpecRenderer from "./SpecRenderer.svelte";
  let {
    backToChat,
    navigation = true,
  }: { backToChat: () => void; navigation?: boolean } = $props();
  const runtime = getRuntime(),
    remote =
      runtime.adapter.kind === "remote"
        ? (runtime.adapter as DoorChatAdapter)
        : null;
  const elevation = new Elevation(remote?.authorizeTask);
  let view = $state<"canvas" | "candidates" | "catalog">("canvas");
  $effect(() => {
    const id =
      runtime.chatContext?.mode === "notebook_lm"
        ? notebookIdFromNamespace(runtime.chatContext.memory_namespace)
        : null;
    const scope = runtime.scopeKey;
    if (!id || !remote?.getNotebook) return;
    let alive = true;
    void remote
      .getNotebook(id)
      .then((detail) => {
        if (alive) runtime.setCanvas(notebookCanvasSpec(detail), scope);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  });
  onDestroy(() => elevation.dispose());
</script>

{#if navigation}<WorkbenchNavigation />{/if}
<aside class="sc-workspace-tools" aria-label="Chat and rendering controls">
  <label
    >Layout <select bind:value={runtime.layout}
      ><option value="balanced">Balanced</option><option value="conversation"
        >Chat focus</option
      ><option value="canvas">Canvas focus</option></select
    ></label
  ><button
    aria-pressed={runtime.inspecting}
    onclick={() => (runtime.inspecting = !runtime.inspecting)}
    >Inspect spec</button
  ><button onclick={() => runtime.renderRevision++}>Render again</button><button
    onclick={backToChat}>Back to chat</button
  ><span class="sr-only" role="status"
    >{runtime.renderRevision
      ? "Current spec rendered again."
      : "Local view controls"}</span
  >
</aside>
{#key runtime.chatContext?.session_id ?? "local"}<AccountabilityEvidence
  />{/key}<WorkbenchPanels />
<section
  aria-label="Canvas workspace"
  hidden={runtime.view !== "canvas" && runtime.view !== "accountability"}
>
  <h2>Interface canvas</h2>
  {#if remote?.gallery}<nav
      class="workspace-controls"
      aria-label="Workspace views"
    >
      {#each ["canvas", "candidates", "catalog"] as tab (tab)}<button
          aria-pressed={view === tab}
          onclick={() => (view = tab as typeof view)}
          >{tab[0].toUpperCase() + tab.slice(1)}</button
        >{/each}
    </nav>{/if}
  {#if remote?.gallery && view !== "canvas"}{#key view}<GalleryPanel
        gallery={remote.gallery}
        {view}
        elevate={elevation.elevate}
        onShow={(spec) => {
          runtime.setCanvas(spec);
          view = "canvas";
        }}
      />{/key}{:else}{#key runtime.renderRevision}<SpecRenderer
        spec={runtime.canvasSpec}
      />{/key}{/if}
  {#if runtime.inspecting}<pre class="workbench-spec-inspector">{JSON.stringify(
        runtime.canvasSpec,
        null,
        2,
      )}</pre>{/if}
</section>
<SudoPrompt {elevation} />
