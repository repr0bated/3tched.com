<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props, emit }: BaseComponentProps<UiProps<"uiTextInput">> = $props();
</script>

<label class="ui ui-field"
  ><span>{props.label}</span><input
    type="text"
    value={props.initialValue ?? ""}
    disabled={props.disabled}
    required={props.required}
    oninput={() => emit("change")}
  /></label
>
