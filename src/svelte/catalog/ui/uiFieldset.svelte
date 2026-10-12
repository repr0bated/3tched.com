<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props, children }: BaseComponentProps<UiProps<"uiFieldset">> = $props();
</script>

<fieldset class="ui ui-stack" disabled={props.disabled}>
  <legend>{props.legend}</legend>{@render children?.()}
</fieldset>
