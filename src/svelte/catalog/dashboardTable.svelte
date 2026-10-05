<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { ChatCatalog } from "../../json-render/catalog/chat-catalog";
  let {
    props,
  }: BaseComponentProps<InferComponentProps<ChatCatalog, "dashboardTable">> =
    $props();
</script>

<div class="db-ref db-ref-table">
  <table>
    <caption>{props.caption}</caption><thead
      ><tr
        >{#each props.columns as column (column.id)}<th scope="col"
            >{column.label}</th
          >{/each}</tr
      ></thead
    ><tbody
      >{#each props.rows as row (row.id)}<tr
          >{#each props.columns as column, index (column.id)}<td
              >{row.cells[index] ?? "—"}</td
            >{/each}</tr
        >{:else}<tr
          ><td colspan={props.columns.length}
            >{props.emptyLabel ?? "No reference rows"}</td
          ></tr
        >{/each}</tbody
    >
  </table>
</div>
