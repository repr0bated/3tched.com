<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props, children }: BaseComponentProps<UiProps<"uiWell">> = $props();
</script>

<div class="ui ui-well" aria-label={props.label}>{@render children?.()}</div>
