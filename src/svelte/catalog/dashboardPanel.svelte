<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { DashboardCatalog } from "../../json-render/catalog/dashboard-elements";
  let {
    props,
    children,
  }: BaseComponentProps<InferComponentProps<DashboardCatalog, "dashboardPanel">> =
    $props();
</script>

<section class="db-ref db-ref-panel" data-tone={props.tone ?? "neutral"}>
  <header>
    <h2>{props.title}</h2>
    {#if props.subtitle}<p>{props.subtitle}</p>{/if}
  </header>
  {@render children?.()}
</section>
