<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { ChatCatalog } from "../../json-render/catalog/chat-catalog";
  let {
    props,
  }: BaseComponentProps<InferComponentProps<ChatCatalog, "dashboardEventLog">> =
    $props();
</script>

<section class="db-ref db-ref-log" aria-label={props.title}>
  <h3>{props.title}</h3>
  <ol>
    {#each props.entries as entry, index (index)}<li
        data-tone={entry.tone ?? "neutral"}
      >
        <time>{entry.time}</time><strong>{entry.title}</strong
        >{#if entry.detail}<p>{entry.detail}</p>{/if}
      </li>{/each}
  </ol>
</section>
