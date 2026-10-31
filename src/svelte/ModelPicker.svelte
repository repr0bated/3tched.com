<script lang="ts">
  import { untrack } from "svelte";
  import { getRuntime } from "./runtime.svelte";
  import { selectionLabel, sameSelection } from "./model-selection";
  import RouteFields from "./RouteFields.svelte";
  import ControlPlanePicker from "./ControlPlanePicker.svelte";
  import { CHAT_MODES } from "../chat/chat-mode";
  const runtime = getRuntime();
  let draft = $state.raw(untrack(() => runtime.route));
  let queued = false;
  const keyOf = (value: typeof draft) => `${value.providerId}/${value.modelId}`;
  const selectable = (value: typeof draft) =>
    runtime.providers
      .find((p) => p.id === value.providerId)
      ?.models.some((m) => m.id === value.modelId && m.available !== false) ?? false;
  async function settle() {
    let last: string | null = null;
    while (!sameSelection(draft, runtime.route)) {
      if (!selectable(draft) || runtime.routePending) break;
      const key = keyOf(draft);
      if (key === last) break;
      last = key;
      await runtime.applyRoute(draft);
    }
  }
  function select(value: typeof draft) {
    const providerSwitched = value.providerId !== draft.providerId;
    draft = value;
    if (providerSwitched) return;
    if (queued) return;
    queued = true;
    void Promise.resolve().then(() => {
      queued = false;
      void settle();
    });
  }
</script>

{#if runtime.adapter.kind === "local" || runtime.chatContext}
  <section
    class="routing-strip model-picker"
    aria-label={runtime.adapter.kind === "local"
      ? "Local model routing"
      : "Router model selection"}
  >
    <div class="routing-strip__label">
      <span
        >{CHAT_MODES.find((m) => m.id === runtime.chatContext?.mode)?.label ??
          "Local"} model</span
      ><small
        >{runtime.chatContext?.mode === "control_plane"
          ? "identity-scoped model selection"
          : runtime.adapter.kind === "local"
            ? "offline workspace"
            : runtime.chatContext?.mode === "ui_render"
              ? "backend-configured generation"
              : "router selection"}</small
      >
    </div>
    {#if runtime.adapter.kind === "remote" && runtime.chatContext?.mode === "control_plane"}<ControlPlanePicker
      />
    {:else if runtime.adapter.kind === "remote" && (runtime.chatContext?.mode === "ui_render" || runtime.chatContext?.mode === "accountability")}
      <p class="route-status">
        {runtime.chatContext?.mode === "ui_render"
          ? "UI generation uses the backend's configured model. No model-change permission or elevation is required."
          : "No separate model selection in this mode."}
      </p>
    {:else}
      <RouteFields
        providers={runtime.providers}
        {draft}
        setDraft={select}
        disabled={runtime.routePending}
      />
      <div class="route-catalog model-picker__actions">
        {#if runtime.adapter.refreshProviders}<button
            disabled={runtime.catalogPending}
            onclick={() => void runtime.refreshProviders()}
            >{runtime.catalogPending ? "Refreshing…" : "Refresh models"}</button
          >{/if}
      </div>
      <div class="model-picker__state">
        {#if runtime.routeReadError}<p role="alert">{runtime.routeReadError}</p>{/if}
        <p class="model-picker__current">
          <span>{runtime.routeConfirmed ? "Current model" : "Not applied"}</span
          >{runtime.routeConfirmed
            ? selectionLabel(runtime.route, runtime.providers)
            : "Select a model to set the route."}
        </p>
        <p class="route-status" role="status" aria-live="polite">
          {runtime.routePending
            ? `Setting ${selectionLabel(runtime.routeAttempt ?? draft, runtime.providers)}`
            : runtime.adapter.kind === "local"
              ? "Local selection · no network calls"
              : "Selection sets the router route"}
        </p>
        {#if runtime.routeError}<p role="alert">
            Could not set {selectionLabel(
              runtime.routeAttempt ?? draft,
              runtime.providers,
            )}: {runtime.routeError}
          </p>{/if}
        {#if runtime.catalogError}<p role="alert">
            Model catalog: {runtime.catalogError}
          </p>{/if}
        {#if !runtime.providers.length}<p>No provider is configured.</p>{/if}
      </div>
    {/if}
  </section>
{/if}
