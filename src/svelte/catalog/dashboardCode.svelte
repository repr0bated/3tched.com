<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { DashboardCatalog } from "../../json-render/catalog/dashboard-elements";
  let {
    props,
  }: BaseComponentProps<InferComponentProps<DashboardCatalog, "dashboardCode">> =
    $props();
</script>

<figure class="db-ref db-ref-code">
  <figcaption>
    {props.title}{props.language ? ` · ${props.language}` : ""}
  </figcaption>
  <pre><code>{props.code}</code></pre>
</figure>
