<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props }: BaseComponentProps<UiProps<"uiCodeBlock">> = $props();
</script>

<figure class="ui ui-code-block">
  {#if props.language}<figcaption>{props.language}</figcaption>{/if}
  <pre><code>{props.code}</code></pre>
</figure>
