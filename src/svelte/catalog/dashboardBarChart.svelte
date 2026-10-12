<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { DashboardCatalog } from "../../json-render/catalog/dashboard-elements";
  let {
    props,
  }: BaseComponentProps<InferComponentProps<DashboardCatalog, "dashboardBarChart">> =
    $props();
</script>

<figure class="db-ref db-ref-bars">
  <figcaption>{props.title}</figcaption>
  <ul>
    {#each props.bars as bar, index (index)}<li>
        <span>{bar.label}</span><meter
          min="0"
          max="100"
          value={bar.value}
          aria-label={`${bar.label}: ${bar.value}%`}
        ></meter><span>{bar.value}%</span>
      </li>{/each}
  </ul>
</figure>
