<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props }: BaseComponentProps<UiProps<"uiInfoMessage">> = $props();
</script>

<div class="ui ui-message" data-tone="info" role="status">
  {#if props.title}<strong>{props.title}</strong>{/if}
  <p>{props.message}</p>
</div>
