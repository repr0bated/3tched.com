<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props, emit }: BaseComponentProps<UiProps<"uiCheckbox">> = $props();
</script>

<label class="ui ui-inline"
  ><input
    type="checkbox"
    checked={props.initialChecked ?? false}
    disabled={props.disabled}
    onchange={() => emit("change")}
  />{props.label}</label
>
