<script lang="ts">
  import { getRuntime } from "./runtime.svelte";
  const runtime = getRuntime();
  const views = [
    ["canvas", "Canvas"],
    ["accountability", "Accountability"],
    ["compliance", "Compliance"],
    ["routing", "Schema routing"],
  ] as const;
</script>

<nav class="workbench-navigation" aria-label="Identity workspace">
  {#each views as [id, label] (id)}<button
      type="button"
      aria-current={runtime.view === id ? "page" : undefined}
      aria-pressed={runtime.view === id}
      onclick={() => (runtime.view = id)}>{label}</button
    >{/each}
</nav>
