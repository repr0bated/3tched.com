<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { ChatCatalog } from "../../json-render/catalog/chat-catalog";
  let {
    props,
  }: BaseComponentProps<
    InferComponentProps<ChatCatalog, "notebookSourceList">
  > = $props();
</script>

<section class="db-ref db-ref-log" aria-label="Notebook sources">
  <h3>Sources</h3>
  {#if props.sources.length === 0}<p>
      This notebook has no sources yet.
    </p>{:else}<ol>
      {#each props.sources as source (source.id)}<li>
          <strong>{source.title || source.id}</strong>
        </li>{/each}
    </ol>{/if}
</section>
