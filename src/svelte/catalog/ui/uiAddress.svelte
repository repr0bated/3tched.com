<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props }: BaseComponentProps<UiProps<"uiAddress">> = $props();
</script>

<address class="ui ui-address">{props.text}</address>
