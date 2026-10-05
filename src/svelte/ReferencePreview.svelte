<script lang="ts">
  import SpecRenderer from "./SpecRenderer.svelte";
  import { dashboardReferences } from "../json-render/references/dashboard-examples";
  let selected = $state(
    new URLSearchParams(window.location.search).get("menu") ?? "overview",
  );
  let reference = $derived(
    dashboardReferences.find((item) => item.id === selected) ??
      dashboardReferences[0],
  );
</script>

<main style="max-width:1180px;margin:0 auto;padding:24px">
  <nav aria-label="Static reference library" style="margin-bottom:24px">
    <label for="reference-menu">Reference menu </label><select
      id="reference-menu"
      bind:value={selected}
      >{#each dashboardReferences as item (item.id)}<option value={item.id}
          >{item.section} / {item.label}</option
        >{/each}</select
    >
    <p>
      Reusable json-render compositions · offline preview · no host connection
    </p>
  </nav>
  <div data-reference-id={reference.id}>
    <SpecRenderer spec={reference.spec} />
  </div>
</main>
