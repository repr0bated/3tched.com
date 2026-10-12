<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { DashboardCatalog } from "../../json-render/catalog/dashboard-elements";
  let {
    props,
  }: BaseComponentProps<InferComponentProps<DashboardCatalog, "dashboardStatus">> =
    $props();
</script>

<div class="db-ref db-ref-status" data-tone={props.tone} role="status">
  <strong>{props.label}</strong>{#if props.detail}<span>{props.detail}</span
    >{/if}
</div>
