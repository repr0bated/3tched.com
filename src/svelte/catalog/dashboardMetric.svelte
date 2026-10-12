<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { DashboardCatalog } from "../../json-render/catalog/dashboard-elements";
  let {
    props,
  }: BaseComponentProps<InferComponentProps<DashboardCatalog, "dashboardMetric">> =
    $props();
</script>

<section
  class="db-ref db-ref-metric"
  data-tone={props.tone ?? "neutral"}
  aria-label={props.label}
>
  <span>{props.label}</span><strong>{props.value}</strong
  >{#if props.detail}<small>{props.detail}</small>{/if}
</section>
