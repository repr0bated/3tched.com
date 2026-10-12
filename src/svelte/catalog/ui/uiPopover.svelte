<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props, children }: BaseComponentProps<UiProps<"uiPopover">> = $props();
</script>

<details class="ui ui-popover">
  <summary>{props.label}</summary>
  <div class="ui-panel">
    <strong>{props.title}</strong>
    <p>{props.text}</p>
    {@render children?.()}
  </div>
</details>
