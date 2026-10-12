<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props }: BaseComponentProps<UiProps<"uiSkeleton">> = $props();
</script>

<div class="ui ui-stack" role="status" aria-label={props.label}>
  {#each Array(props.lines ?? 3) as _, i (i)}<span
      class="ui-skeleton"
      aria-hidden="true"
    ></span>{/each}<span class="ui-muted">{props.label}</span>
</div>
