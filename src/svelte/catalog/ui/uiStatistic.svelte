<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props }: BaseComponentProps<UiProps<"uiStatistic">> = $props();
</script>

<div class="ui ui-panel">
  <span class="ui-muted">{props.label}</span><strong class="ui-stat"
    >{props.value}</strong
  >{#if props.detail}<small>{props.detail}</small>{/if}
</div>
