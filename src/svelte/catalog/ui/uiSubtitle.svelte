<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props }: BaseComponentProps<UiProps<"uiSubtitle">> = $props();
</script>

<h3 class="ui ui-subtitle">{props.text}</h3>
