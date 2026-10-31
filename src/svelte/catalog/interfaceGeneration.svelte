<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { ChatCatalog } from "../../json-render/catalog/chat-catalog";
  import { getRuntime } from "../runtime.svelte";
  let { ..._props }: BaseComponentProps<
    InferComponentProps<ChatCatalog, "interfaceGeneration">
  > = $props();
  const runtime = getRuntime();
  let maxTurnSecs = $state(300);
  const maxTurnMs = () => Math.min(900, Math.max(10, Math.round(Number(maxTurnSecs) || 0))) * 1000;
</script>

<section aria-label="Post-login interface" aria-busy={runtime.interfacePending}>
  {#if runtime.interfacePending}
    <p role="status">The chatbot is generating your interface…</p>
  {:else}
    <fieldset class="render-options">
      <legend>Render options</legend>
      <label><input type="checkbox" disabled title="Requires sealed-contract support in chat_response.submit_turn (not yet sealed)" /> Include Qdrant vector context <small>unsupported</small></label>
      <label><input type="checkbox" disabled title="Requires sealed-contract support in chat_response.submit_turn (not yet sealed)" /> Include Cozo graph context <small>unsupported</small></label>
      <label><input type="checkbox" disabled title="Requires sealed-contract support in chat_response.submit_turn (not yet sealed)" /> Full schema as one dataset <small>unsupported</small></label>
      <label>Max UI wait for the committed turn, in seconds (server generation time is unchanged) <input type="number" min="10" max="900" bind:value={maxTurnSecs} disabled={runtime.interfacePending} /></label>
      <p><small>UI generation persists no memory — the server recalls nothing in ui_render mode, including pending pushes.</small></p>
    </fieldset>
  {/if}
  {#if runtime.interfaceError}
    <p role="alert">Could not load the chatbot-generated interface: {runtime.interfaceError}</p>
    <button class="sc-button" onclick={() => void runtime.loadInterface(true, { maxTurnMs: maxTurnMs() })}>
      Retry interface generation
    </button>
  {:else if !runtime.interfacePending}
    <p role="status">Waiting for the authenticated chat context…</p>
  {/if}
</section>
