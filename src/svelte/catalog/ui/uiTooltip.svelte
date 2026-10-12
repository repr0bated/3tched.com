<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props }: BaseComponentProps<UiProps<"uiTooltip">> = $props();
  const id = $props.id();
  let dismissed = $state(false);
</script>

<span class="ui ui-tooltip" data-dismissed={dismissed}>
  <button
    type="button"
    onpointerenter={() => (dismissed = false)}
    aria-describedby={id}
    onfocus={() => (dismissed = false)}
    onkeydown={(event) => {
      if (event.key === "Escape") dismissed = true;
    }}>{props.label}</button
  >
  <span {id} role="tooltip">{props.text}</span>
</span>
