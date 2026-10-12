<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { DashboardCatalog } from "../../json-render/catalog/dashboard-elements";
  let {
    props,
    children,
  }: BaseComponentProps<
    InferComponentProps<DashboardCatalog, "dashboardDisclosure">
  > = $props();
</script>

<details class="db-ref db-ref-disclosure" open={props.initiallyOpen}>
  <summary>{props.title}</summary>{#if props.summary}<p>
      {props.summary}
    </p>{/if}{@render children?.()}
</details>
