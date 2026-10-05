<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import { Elevation } from "../../svelte/elevation.svelte";
  import SudoPrompt from "../../svelte/SudoPrompt.svelte";
  import type { AuthorizeTask } from "../../chat/elevation";
  let { authorize, mutate }: { authorize: AuthorizeTask; mutate: () => void } =
    $props();
  let elevation = $state.raw(new Elevation(untrack(() => authorize)));
  $effect(() => {
    const next = new Elevation(authorize);
    untrack(() => elevation.dispose());
    elevation = next;
    return () => next.dispose();
  });
  onDestroy(() => elevation.dispose());
</script>

<button
  onclick={() =>
    void elevation
      .elevate("tched_router", "config_set", {
        path: "agents.control_plane.model_provider",
        value: "openai.old",
      })
      .then(mutate)
      .catch(() => undefined)}>Start protected task</button
><SudoPrompt {elevation} />
