<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props }: BaseComponentProps<UiProps<"uiDescriptionList">> = $props();
</script>

<dl class="ui ui-description">
  {#each props.items as item, i (i)}<div>
      <dt>{item.term}</dt>
      <dd>{item.description}</dd>
    </div>{/each}
</dl>
