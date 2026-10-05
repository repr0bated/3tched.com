<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { ChatCatalog } from "../../json-render/catalog/chat-catalog";
  let {
    props,
  }: BaseComponentProps<InferComponentProps<ChatCatalog, "dashboardBarChart">> =
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
