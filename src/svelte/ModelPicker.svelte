<script lang="ts">
  import { untrack } from "svelte";
  import { getRuntime } from "./runtime.svelte";
  import { selectionLabel, sameSelection } from "./model-selection";
  import RouteFields from "./RouteFields.svelte";
  import ControlPlanePicker from "./ControlPlanePicker.svelte";
  import { CHAT_MODES } from "../chat/chat-mode";
  const runtime = getRuntime();
  let draft = $state.raw(untrack(() => runtime.route));
  let valid = $derived(
    runtime.providers
      .find((p) => p.id === draft.providerId)
      ?.models.some((m) => m.id === draft.modelId && m.available !== false) ?? false,
  );
  let changed = $derived(!sameSelection(draft, runtime.route));
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
    {:else if runtime.adapter.kind === "remote" && runtime.chatContext?.mode === "ui_render"}
      <p class="route-status">
        UI generation uses the backend’s configured model. No model-change
        permission or elevation is required.
      </p>
    {:else}
      <RouteFields
        providers={runtime.providers}
        {draft}
        setDraft={(value) => (draft = value)}
        disabled={runtime.routePending}
      />
      <div class="route-catalog model-picker__actions">
        <button
          disabled={runtime.routePending ||
            !valid ||
            (runtime.routeConfirmed && !changed)}
          onclick={() => void runtime.applyRoute(draft)}
          >{runtime.routePending ? "Applying…" : "Apply model"}</button
        >{#if runtime.adapter.refreshProviders}<button
            disabled={runtime.catalogPending}
            onclick={() => void runtime.refreshProviders()}
            >{runtime.catalogPending ? "Refreshing…" : "Refresh models"}</button
          >{/if}
      </div>
      <div class="model-picker__state">
        {#if runtime.routeReadError}<p role="alert">{runtime.routeReadError}</p>{/if}
        <p class="model-picker__current">
          <span>{runtime.routeConfirmed ? "Last applied" : "Not applied"}</span
          >{runtime.routeConfirmed
            ? selectionLabel(runtime.route, runtime.providers)
            : "Choose a model and apply to confirm the route."}
        </p>
        <p class="route-status" role="status" aria-live="polite">
          {runtime.routePending
            ? `Applying ${selectionLabel(runtime.routeAttempt ?? draft, runtime.providers)}`
            : changed
              ? `Pending: ${selectionLabel(draft, runtime.providers)}`
              : runtime.adapter.kind === "local"
                ? "Local selection · no network calls"
                : "Apply confirms the router selection"}
        </p>
        {#if runtime.routeError}<p role="alert">
            Could not apply {selectionLabel(
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
