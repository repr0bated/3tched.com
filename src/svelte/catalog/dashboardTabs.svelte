<script lang="ts">
  import { untrack } from "svelte";
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { DashboardCatalog } from "../../json-render/catalog/dashboard-elements";
  let {
    props,
  }: BaseComponentProps<InferComponentProps<DashboardCatalog, "dashboardTabs">> =
    $props();
  const id = $props.id();
  let selected = $state(untrack(() => props.initialTab ?? props.tabs[0]?.id));
  let index = $derived(
    Math.max(
      0,
      props.tabs.findIndex((tab) => tab.id === selected),
    ),
  );
  function keyboard(e: KeyboardEvent, i: number) {
    const next =
      e.key === "ArrowRight"
        ? (i + 1) % props.tabs.length
        : e.key === "ArrowLeft"
          ? (i - 1 + props.tabs.length) % props.tabs.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? props.tabs.length - 1
              : null;
    if (next === null) return;
    e.preventDefault();
    selected = props.tabs[next].id;
    (e.currentTarget as HTMLElement).parentElement
      ?.querySelectorAll<HTMLButtonElement>("[role=tab]")
      [next]?.focus();
  }
</script>

<section class="db-ref db-ref-tabs" aria-label={props.label}>
  <div role="tablist" aria-label={props.label} class="db-ref-tabs__list">
    {#each props.tabs as tab, i (tab.id)}<button
        id={`${id}-tab-${i}`}
        role="tab"
        aria-selected={index === i}
        aria-controls={`${id}-panel-${i}`}
        tabindex={index === i ? 0 : -1}
        onclick={() => (selected = tab.id)}
        onkeydown={(e) => keyboard(e, i)}>{tab.label}</button
      >{/each}
  </div>
  <div
    id={`${id}-panel-${index}`}
    role="tabpanel"
    aria-labelledby={`${id}-tab-${index}`}
    tabindex="0"
    class="db-ref-tabs__panel"
  >
    {props.tabs[index]?.content}
  </div>
</section>
