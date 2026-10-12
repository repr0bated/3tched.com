<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props }: BaseComponentProps<UiProps<"uiMeter">> = $props();
</script>

<label class="ui ui-stack"
  >{props.label}
  <meter max="100" value={props.value}>{props.value}%</meter><span
    >{props.value}%</span
  ></label
>
