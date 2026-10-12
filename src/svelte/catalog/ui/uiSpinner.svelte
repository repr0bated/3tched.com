<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props }: BaseComponentProps<UiProps<"uiSpinner">> = $props();
</script>

<span class="ui ui-inline" role="status"
  ><span class="ui-spinner" aria-hidden="true"></span>{props.label}</span
>
