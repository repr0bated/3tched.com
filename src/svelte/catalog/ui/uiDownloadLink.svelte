<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props }: BaseComponentProps<UiProps<"uiDownloadLink">> = $props();
</script>

<a
  class="ui ui-link"
  href={`data:text/plain;charset=utf-8,${encodeURIComponent(props.content)}`}
  download={props.filename}>{props.label}</a
>
