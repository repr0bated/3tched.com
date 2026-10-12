<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props }: BaseComponentProps<UiProps<"uiKeyValue">> = $props();
</script>

<dl class="ui ui-description">
  <div>
    <dt>{props.label}</dt>
    <dd>{props.value}</dd>
  </div>
</dl>
