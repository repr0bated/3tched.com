<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props }: BaseComponentProps<UiProps<"uiValidationMessage">> = $props();
</script>

<p class="ui ui-message" data-tone="danger" role="alert">{props.message}</p>
