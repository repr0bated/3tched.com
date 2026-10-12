<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props }: BaseComponentProps<UiProps<"uiTitle">> = $props();
</script>

<h2 class="ui ui-title">{props.text}</h2>
