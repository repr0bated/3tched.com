<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props, emit }: BaseComponentProps<UiProps<"uiTabs">> = $props();
  const id = $props.id();
  let selected = $state(0);
  function keyboard(event: KeyboardEvent, index: number) {
    const count = props.tabs.length;
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % count
        : event.key === "ArrowLeft"
          ? (index + count - 1) % count
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? count - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    selected = next;
    emit("change");
    (event.currentTarget as HTMLElement).parentElement
      ?.querySelectorAll<HTMLButtonElement>("button")
      [next]?.focus();
  }
</script>

<div class="ui ui-stack">
  <div class="ui-inline" role="tablist" aria-label={props.label}>
    {#each props.tabs as tab, i (i)}<button
        type="button"
        role="tab"
        id={`${id}-tab-${i}`}
        aria-controls={`${id}-panel-${i}`}
        aria-selected={selected === i}
        tabindex={selected === i ? 0 : -1}
        onclick={() => {
          selected = i;
          emit("change");
        }}
        onkeydown={(event) => keyboard(event, i)}>{tab.label}</button
      >{/each}
  </div>
  <div
    class="ui-panel"
    role="tabpanel"
    id={`${id}-panel-${selected}`}
    aria-labelledby={`${id}-tab-${selected}`}
    tabindex="0"
  >
    {props.tabs[selected]?.content}
  </div>
</div>
