<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props, emit }: BaseComponentProps<UiProps<"uiRating">> = $props();
  const id = $props.id();
</script>

<fieldset class="ui ui-inline" disabled={props.disabled}>
  <legend>{props.label}</legend>{#each [1, 2, 3, 4, 5] as value (value)}<label
      ><input
        type="radio"
        name={id}
        {value}
        checked={props.initialValue === value}
        onchange={() => emit("change")}
      />{value} <span aria-hidden="true">★</span><span class="ui-sr-only"
        >stars</span
      ></label
    >{/each}
</fieldset>
