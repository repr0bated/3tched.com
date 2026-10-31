<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { ChatCatalog } from "../../json-render/catalog/chat-catalog";
  import { getRuntime } from "../runtime.svelte";
  let { ..._props }: BaseComponentProps<
    InferComponentProps<ChatCatalog, "interfaceGeneration">
  > = $props();
  const runtime = getRuntime();
</script>

<section aria-label="Post-login interface" aria-busy={runtime.interfacePending}>
  {#if runtime.interfacePending}
    <p role="status">The chatbot is generating your interface…</p>
  {:else if runtime.interfaceError}
    <p role="alert">Could not load the chatbot-generated interface: {runtime.interfaceError}</p>
    <button class="sc-button" onclick={() => void runtime.loadInterface(true)}>
      Retry interface generation
    </button>
  {:else}
    <p role="status">Waiting for the authenticated chat context…</p>
  {/if}
</section>
