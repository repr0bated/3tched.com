<script lang="ts">
  import type { ProviderOption, RouteSelection } from "../chat/chat-adapter";
  let {
    providers,
    draft,
    setDraft,
    disabled,
    refresh,
  }: {
    providers: ProviderOption[];
    draft: RouteSelection;
    setDraft: (route: RouteSelection) => void;
    disabled: boolean;
    refresh: () => Promise<void>;
  } = $props();
  let provider = $derived(providers.find((p) => p.id === draft.providerId));
  let models = $derived(provider?.models ?? []);
</script>

<label
  ><span>Provider</span><select
    value={draft.providerId}
    disabled={disabled || !providers.length}
    onfocus={() => void refresh()}
    onchange={(e) => {
      const next = providers.find((p) => p.id === e.currentTarget.value);
      if (next)
        setDraft({ providerId: next.id, modelId: next.models[0]?.id ?? "" });
    }}
  >
    {#if !providers.length}<option value="">No providers available</option
      >{:else if !provider}<option value={draft.providerId} disabled
        >{draft.providerId} (no longer listed)</option
      >{:else if provider.auth || provider.endpoint}<option disabled>{provider.auth ? `Auth: ${provider.auth}` : ''} {provider.endpoint ? `Endpoint: ${provider.endpoint}` : ''}</option
      >{/if}{#each providers as entry (entry.id)}<option value={entry.id}
        >{entry.label}</option
      >{/each}
  </select></label
>
<label class="model-select"
  ><span>Model</span><select
    value={models.length ? draft.modelId : ""}
    disabled={disabled || !models.length}
    onfocus={() => void refresh()}
    onchange={(e) => setDraft({ ...draft, modelId: e.currentTarget.value })}
  >
    {#if !models.length}<option value="">No models for this provider yet</option
      >{:else}{#if !models.some((m) => m.id === draft.modelId)}<option
          value={draft.modelId}
          disabled>{draft.modelId || "Select a model"} (no longer listed)</option
        >{/if}{#each models as entry (entry.id)}<option value={entry.id}
          >{entry.label}{entry.auth ? ` (${entry.auth})` : ''}</option
        >{/each}{/if}
  </select></label
>
