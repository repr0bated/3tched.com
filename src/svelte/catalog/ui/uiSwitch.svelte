<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props, emit }: BaseComponentProps<UiProps<"uiSwitch">> = $props();
</script>

<label class="ui ui-inline"
  ><input
    type="checkbox"
    role="switch"
    checked={props.initialChecked ?? false}
    disabled={props.disabled}
    onchange={() => emit("change")}
  />{props.label}</label
>
