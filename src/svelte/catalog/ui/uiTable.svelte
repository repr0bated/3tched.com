<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props }: BaseComponentProps<UiProps<"uiTable">> = $props();
</script>

<!-- Keyboard users must be able to focus and scroll this overflow region. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="ui ui-scroll" role="region" aria-label={props.caption} tabindex="0">
  <table>
    <caption>{props.caption}</caption><thead
      ><tr
        >{#each props.columns as column, i (i)}<th scope="col">{column}</th
          >{/each}</tr
      ></thead
    ><tbody
      >{#each props.rows as row, i (i)}<tr
          >{#each row as cell, j (j)}<td>{cell}</td>{/each}</tr
        >{/each}</tbody
    >
  </table>
</div>
