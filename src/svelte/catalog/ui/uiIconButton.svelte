<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props, emit }: BaseComponentProps<UiProps<"uiIconButton">> = $props();
  const icons = { add: "+", close: "×", search: "⌕", settings: "⚙", more: "⋯" };
</script>

<button
  class="ui ui-button"
  type="button"
  aria-label={props.label}
  title={props.label}
  disabled={props.disabled}
  onclick={() => emit("press")}
  ><span aria-hidden="true">{icons[props.icon]}</span></button
>
