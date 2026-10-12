<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props, emit }: BaseComponentProps<UiProps<"uiRange">> = $props();
  import { untrack } from "svelte";
  let value = $state(untrack(() => props.initialValue ?? 50));
</script>

<label class="ui ui-field"
  ><span>{props.label}: {value}</span><input
    type="range"
    min="0"
    max="100"
    bind:value
    disabled={props.disabled}
    oninput={() => emit("change")}
  /></label
>
