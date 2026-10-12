<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props, children }: BaseComponentProps<UiProps<"uiCard">> = $props();
</script>

<article class="ui ui-card" aria-label={props.label}>
  {@render children?.()}
</article>
