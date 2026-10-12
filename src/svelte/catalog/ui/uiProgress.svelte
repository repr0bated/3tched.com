<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props }: BaseComponentProps<UiProps<"uiProgress">> = $props();
</script>

<label class="ui ui-stack"
  >{props.label}
  <progress max="100" value={props.value}>{props.value}%</progress><span
    >{props.value}%</span
  ></label
>
