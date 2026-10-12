<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props }: BaseComponentProps<UiProps<"uiOrderedList">> = $props();
</script>

<ol class="ui ui-list" aria-label={props.label}>
  {#each props.items as item, i (i)}<li>{item}</li>{/each}
</ol>
