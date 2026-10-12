<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props, children }: BaseComponentProps<UiProps<"uiGrid">> = $props();
</script>

<div
  class="ui ui-grid"
  aria-label={props.label}
  style={`--ui-columns: ${props.columns ?? 3}`}
>
  {@render children?.()}
</div>
