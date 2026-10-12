<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props }: BaseComponentProps<UiProps<"uiBlockquote">> = $props();
</script>

<figure class="ui ui-quote">
  <blockquote>{props.text}</blockquote>
  {#if props.attribution}<figcaption>— {props.attribution}</figcaption>{/if}
</figure>
