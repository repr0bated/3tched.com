<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { DashboardCatalog } from "../../json-render/catalog/dashboard-elements";
  let {
    props,
  }: BaseComponentProps<
    InferComponentProps<DashboardCatalog, "dashboardKeyValues">
  > = $props();
</script>

<section class="db-ref db-ref-kv" aria-label={props.title ?? "Details"}>
  {#if props.title}<h3>{props.title}</h3>{/if}
  <dl>
    {#each props.rows as row, index (index)}<div>
        <dt>{row.label}</dt>
        <dd>{row.value}</dd>
      </div>{/each}
  </dl>
</section>
