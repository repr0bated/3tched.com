<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props }: BaseComponentProps<UiProps<"uiAbbreviation">> = $props();
</script>

<abbr class="ui" title={props.expansion}>{props.text}</abbr>
