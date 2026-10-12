<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props }: BaseComponentProps<UiProps<"uiStepper">> = $props();
</script>

<ol class="ui ui-inline ui-steps" aria-label={props.label}>
  {#each props.steps as step, i (i)}<li
      aria-current={i === props.current ? "step" : undefined}
      data-complete={i < props.current}
    >
      {step}
    </li>{/each}
</ol>
