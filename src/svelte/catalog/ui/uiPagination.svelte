<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props, emit }: BaseComponentProps<UiProps<"uiPagination">> = $props();
  import { untrack } from "svelte";
  let page = $state(untrack(() => props.initialPage ?? 1));
</script>

<nav class="ui ui-inline" aria-label={props.label}>
  <button
    type="button"
    disabled={page <= 1}
    onclick={() => {
      page--;
      emit("change");
    }}>Previous</button
  ><span role="status">Page {page} of {props.pages}</span><button
    type="button"
    disabled={page >= props.pages}
    onclick={() => {
      page++;
      emit("change");
    }}>Next</button
  >
</nav>
