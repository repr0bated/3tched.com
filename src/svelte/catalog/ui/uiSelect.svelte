<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props, emit }: BaseComponentProps<UiProps<"uiSelect">> = $props();
</script>

<label class="ui ui-field"
  ><span>{props.label}</span><select
    multiple={false}
    disabled={props.disabled}
    onchange={() => emit("change")}
    >{#each props.options as option, i (i)}<option
        value={option}
        selected={props.initialValue === option}>{option}</option
      >{/each}</select
  ></label
>
