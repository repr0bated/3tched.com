<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props, emit }: BaseComponentProps<UiProps<"uiColorInput">> = $props();
</script>

<label class="ui ui-field"
  ><span>{props.label}</span><input
    type="color"
    value={props.initialValue ?? "#6366f1"}
    disabled={props.disabled}
    required={props.required}
    oninput={() => emit("change")}
  /></label
>
