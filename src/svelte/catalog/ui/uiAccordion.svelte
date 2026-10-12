<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props }: BaseComponentProps<UiProps<"uiAccordion">> = $props();
  const id = $props.id();
</script>

<section class="ui ui-stack" aria-label={props.label}>
  {#each props.items as item, i (i)}<details class="ui-panel" name={id}>
      <summary>{item.title}</summary>
      <p>{item.content}</p>
    </details>{/each}
</section>
