<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props }: BaseComponentProps<UiProps<"uiBreadcrumbs">> = $props();
</script>

<nav class="ui" aria-label={props.label}>
  <ol class="ui-inline ui-plain-list">
    {#each props.items as item, i (i)}<li>
        {#if i > 0}<span aria-hidden="true">
            /
          </span>{/if}{#if i === props.items.length - 1}<span
            aria-current="page">{item.label}</span
          >{:else}<a href={item.href}>{item.label}</a>{/if}
      </li>{/each}
  </ol>
</nav>
