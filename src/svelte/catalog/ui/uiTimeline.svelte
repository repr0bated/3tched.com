<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props }: BaseComponentProps<UiProps<"uiTimeline">> = $props();
</script>

<ol class="ui ui-timeline" aria-label={props.label}>
  {#each props.items as item, i (i)}<li>
      <small>{item.time}</small><strong>{item.title}</strong>
      <p>{item.detail}</p>
    </li>{/each}
</ol>
