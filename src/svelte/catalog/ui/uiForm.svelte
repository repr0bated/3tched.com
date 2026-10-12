<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props, children, emit }: BaseComponentProps<UiProps<"uiForm">> =
    $props();
  let submitted = $state(false);
</script>

<form
  class="ui ui-stack"
  aria-label={props.label}
  onsubmit={(event) => {
    event.preventDefault();
    submitted = true;
    emit("submit");
  }}
>
  {@render children?.()}<button class="ui-button" type="submit"
    >{props.submitLabel}</button
  >
  <p role="status">{submitted ? "Form submitted locally." : ""}</p>
</form>
