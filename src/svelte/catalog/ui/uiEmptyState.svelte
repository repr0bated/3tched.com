<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props }: BaseComponentProps<UiProps<"uiEmptyState">> = $props();
</script>

<div class="ui ui-empty">
  <h3>{props.title}</h3>
  {#if props.description}<p>{props.description}</p>{/if}
</div>
