<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props, children }: BaseComponentProps<UiProps<"uiDisclosure">> =
    $props();
</script>

<details class="ui ui-panel" open={props.initiallyOpen}>
  <summary>{props.title}</summary>{@render children?.()}
</details>
