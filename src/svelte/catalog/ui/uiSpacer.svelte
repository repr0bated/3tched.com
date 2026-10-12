<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props }: BaseComponentProps<UiProps<"uiSpacer">> = $props();
</script>

<div
  class="ui"
  aria-hidden="true"
  style={`height: ${props.size ?? 16}px; flex-shrink: 0`}
></div>
