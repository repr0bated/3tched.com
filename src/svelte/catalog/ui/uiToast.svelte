<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props }: BaseComponentProps<UiProps<"uiToast">> = $props();
</script>

<div class="ui ui-message" data-tone="neutral" role="status">
  {#if props.title}<strong>{props.title}</strong>{/if}
  <p>{props.message}</p>
</div>
