<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props, children }: BaseComponentProps<UiProps<"uiBanner">> = $props();
</script>

<aside class="ui ui-message" data-tone={props.tone ?? "info"}>
  <strong>{props.title}</strong>
  <p>{props.message}</p>
  {@render children?.()}
</aside>
