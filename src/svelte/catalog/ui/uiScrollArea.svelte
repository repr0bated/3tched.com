<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props, children }: BaseComponentProps<UiProps<"uiScrollArea">> =
    $props();
</script>

<!-- Keyboard users must be able to focus and scroll this overflow region. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="ui ui-scroll" aria-label={props.label} tabindex="0" role="region">
  {@render children?.()}
</div>
