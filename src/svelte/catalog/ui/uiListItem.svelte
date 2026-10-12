<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props, children }: BaseComponentProps<UiProps<"uiListItem">> = $props();
</script>

<article class="ui ui-list-item">
  <strong>{props.title}</strong>{#if props.description}<p>
      {props.description}
    </p>{/if}{@render children?.()}
</article>
