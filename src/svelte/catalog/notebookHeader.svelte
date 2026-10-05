<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { ChatCatalog } from "../../json-render/catalog/chat-catalog";
  let {
    props,
  }: BaseComponentProps<InferComponentProps<ChatCatalog, "notebookHeader">> =
    $props();
</script>

<section class="db-ref db-ref-kv" aria-label="Notebook">
  <h3>{props.emoji ? `${props.emoji} ${props.title}` : props.title}</h3>
  <dl>
    <div>
      <dt>Sources</dt>
      <dd>{props.sourceCount}</dd>
    </div>
    {#if props.url}<div>
        <dt>URL</dt>
        <dd>{props.url}</dd>
      </div>{/if}
  </dl>
</section>
