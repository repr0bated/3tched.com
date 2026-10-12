<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props }: BaseComponentProps<UiProps<"uiStatusDot">> = $props();
</script>

<span class="ui ui-inline" data-tone={props.tone ?? "neutral"}
  ><span class="ui-dot" aria-hidden="true"></span>{props.label}</span
>
