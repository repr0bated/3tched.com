<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props }: BaseComponentProps<UiProps<"uiTagGroup">> = $props();
</script>

<ul class="ui ui-inline ui-plain-list" aria-label={props.label}>
  {#each props.tags as tag, i (i)}<li class="ui-tag">{tag}</li>{/each}
</ul>
