<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props, emit }: BaseComponentProps<UiProps<"uiButton">> = $props();
</script>

<button
  class="ui ui-button"
  type="button"
  disabled={props.disabled}
  onclick={() => emit("press")}>{props.label}</button
>
