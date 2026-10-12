<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props, emit }: BaseComponentProps<UiProps<"uiFileInput">> = $props();
</script>

<label class="ui ui-field"
  ><span>{props.label}</span><input
    type="file"
    multiple={props.multiple}
    disabled={props.disabled}
    onchange={() => emit("change")}
  /><small>Selected files stay on this device.</small></label
>
