<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props }: BaseComponentProps<UiProps<"uiStatusBadge">> = $props();
</script>

<span class="ui ui-badge" data-tone={props.tone ?? "neutral"}
  >{props.label}</span
>
