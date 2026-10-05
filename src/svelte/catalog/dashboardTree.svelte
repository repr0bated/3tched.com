<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { ChatCatalog } from "../../json-render/catalog/chat-catalog";
  import type { DashboardTreeNode } from "../../json-render/catalog/dashboard-elements";
  let {
    props,
  }: BaseComponentProps<InferComponentProps<ChatCatalog, "dashboardTree">> =
    $props();
</script>

{#snippet nodes(items: DashboardTreeNode[])}<ul>
    {#each items as node, index (index)}<li>
        <span>{node.label}</span>{#if node.detail}<small>{node.detail}</small
          >{/if}{#if node.children?.length}{@render nodes(node.children)}{/if}
      </li>{/each}
  </ul>{/snippet}
<section class="db-ref db-ref-tree" aria-label={props.title}>
  <h3>{props.title}</h3>
  {@render nodes(props.nodes)}
</section>
