<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props }: BaseComponentProps<UiProps<"uiSearchResults">> = $props();
  let query = $state("");
  let results = $derived(
    props.items.filter((item) =>
      item.toLowerCase().includes(query.toLowerCase()),
    ),
  );
</script>

<section class="ui ui-stack" aria-label={props.label}>
  <label class="ui-field"
    >Filter results<input type="search" bind:value={query} /></label
  >
  <p role="status">{results.length} results</p>
  <ul>
    {#each results as item, i (i)}<li>{item}</li>{/each}
  </ul>
</section>
