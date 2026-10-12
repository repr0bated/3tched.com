<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props, emit }: BaseComponentProps<UiProps<"uiMultiSelect">> = $props();
</script>

<label class="ui ui-field"
  ><span>{props.label}</span><select
    multiple={true}
    disabled={props.disabled}
    onchange={() => emit("change")}
    >{#each props.options as option, i (i)}<option
        value={option}
        selected={props.initialValues?.includes(option)}>{option}</option
      >{/each}</select
  ></label
>
