<script lang="ts">
  import { getContext, setContext, untrack } from "svelte";
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { ChatCatalog } from "../../json-render/catalog/chat-catalog";
  import { registeredComponent } from "../../json-render/references/registered-components";
  import SpecRenderer from "../SpecRenderer.svelte";

  const STACK = "catalog-component-stack";
  let { props }: BaseComponentProps<InferComponentProps<ChatCatalog, "catalogComponent">> = $props();
  const stack = getContext<string[]>(STACK) ?? [];
  const name = untrack(() => props.name);
  const cycle = stack.includes(name);
  setContext(STACK, cycle ? stack : [...stack, name]);
  const entry = $derived(cycle ? undefined : registeredComponent(props.name));
</script>

{#if cycle}
  <p class="sc-catalog-component" role="status">{props.name} cannot include itself.</p>
{:else if entry}
  <div class="sc-catalog-component" aria-label={entry.name}>
    <SpecRenderer spec={entry.spec} />
  </div>
{:else}
  <p class="sc-catalog-component" role="status">{props.name} is not in the catalog yet.</p>
{/if}
