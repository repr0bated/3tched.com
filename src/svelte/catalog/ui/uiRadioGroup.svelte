<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props, emit }: BaseComponentProps<UiProps<"uiRadioGroup">> = $props();
  const id = $props.id();
</script>

<fieldset class="ui ui-stack" disabled={props.disabled}>
  <legend>{props.label}</legend>{#each props.options as option, i (i)}<label
      class="ui ui-inline"
      ><input
        type="radio"
        name={id}
        value={option}
        checked={props.initialValue === option}
        onchange={() => emit("change")}
      />{option}</label
    >{/each}
</fieldset>
