<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props, emit }: BaseComponentProps<UiProps<"uiNumberInput">> = $props();
</script>

<label class="ui ui-field"
  ><span>{props.label}</span><input
    type="number"
    value={props.initialValue ?? ""}
    disabled={props.disabled}
    required={props.required}
    oninput={() => emit("change")}
  /></label
>
