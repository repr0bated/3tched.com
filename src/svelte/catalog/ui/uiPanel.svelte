<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props, children }: BaseComponentProps<UiProps<"uiPanel">> = $props();
</script>

<section class="ui ui-panel" aria-label={props.label}>
  {@render children?.()}
</section>
