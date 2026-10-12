<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props }: BaseComponentProps<UiProps<"uiNotification">> = $props();
</script>

<aside class="ui ui-message" role="status">
  <strong>{props.title}</strong>
  <p>{props.message}</p>
</aside>
