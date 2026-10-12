<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props, emit }: BaseComponentProps<UiProps<"uiToggleButton">> = $props();
  import { untrack } from "svelte";
  let pressed = $state(untrack(() => props.initialPressed ?? false));
</script>

<button
  class="ui ui-button"
  type="button"
  aria-pressed={pressed}
  disabled={props.disabled}
  onclick={() => {
    pressed = !pressed;
    emit("change");
  }}>{props.label}</button
>
