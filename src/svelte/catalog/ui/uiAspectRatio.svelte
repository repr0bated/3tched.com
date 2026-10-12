<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props, children }: BaseComponentProps<UiProps<"uiAspectRatio">> =
    $props();
</script>

<div
  class="ui ui-aspect"
  aria-label={props.label}
  style={`aspect-ratio: ${props.ratio ?? 1.7778}`}
>
  {@render children?.()}
</div>
