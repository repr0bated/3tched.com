<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { DashboardCatalog } from "../../json-render/catalog/dashboard-elements";
  let {
    props,
  }: BaseComponentProps<InferComponentProps<DashboardCatalog, "dashboardTopology">> =
    $props();
  let nodes = $derived(new Map(props.nodes.map((node) => [node.id, node])));
</script>

<figure class="db-ref db-ref-topology">
  <figcaption>{props.title}</figcaption>
  <svg
    viewBox="0 0 800 240"
    role="img"
    aria-label={`${props.title}: ${props.nodes.length} nodes, ${props.edges.length} links`}
    >{#each props.edges as edge, index (index)}{@const from = nodes.get(
        edge.from,
      )}{@const to = nodes.get(edge.to)}{#if from && to}<line
          x1={80 + from.x * 6.4}
          y1={40 + from.y * 1.5}
          x2={80 + to.x * 6.4}
          y2={40 + to.y * 1.5}
        />{/if}{/each}{#each props.nodes as node (node.id)}<g
        ><circle cx={80 + node.x * 6.4} cy={40 + node.y * 1.5} r="8" /><text
          x={80 + node.x * 6.4}
          y={64 + node.y * 1.5}
          text-anchor="middle"
          >{node.label.length > 24
            ? `${node.label.slice(0, 21)}…`
            : node.label}</text
        ></g
      >{/each}</svg
  >
  <div class="db-ref-topology__legend">
    <ul aria-label="Nodes">
      {#each props.nodes as node (node.id)}<li>
          {node.label}{node.detail ? ` — ${node.detail}` : ""}
        </li>{/each}
    </ul>
    <ul aria-label="Links">
      {#each props.edges as edge, index (index)}<li>
          {nodes.get(edge.from)?.label ?? edge.from} → {nodes.get(edge.to)
            ?.label ?? edge.to}{edge.label ? `: ${edge.label}` : ""}
        </li>{/each}
    </ul>
  </div>
</figure>
