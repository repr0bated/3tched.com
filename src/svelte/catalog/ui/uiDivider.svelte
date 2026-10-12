<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props }: BaseComponentProps<UiProps<"uiDivider">> = $props();
</script>

<div class="ui">
  <hr />
  {#if props.label}<small>{props.label}</small>{/if}
</div>
