<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props }: BaseComponentProps<UiProps<"uiTimestamp">> = $props();
</script>

<time class="ui" datetime={props.datetime}>{props.text}</time>
