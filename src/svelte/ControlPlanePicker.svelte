<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { getRuntime } from "./runtime.svelte";
  import type { DoorChatAdapter } from "../chat/door-chat-adapter";
  import type { RouteSelection } from "../chat/chat-adapter";
  import { ControlPlaneMutationUnconfirmedError } from "../chat/control-plane-model";
  import {
    catalogDraft,
    selectionLabel,
    sameSelection,
  } from "./model-selection";
  import { Elevation } from "./elevation.svelte";
  import SudoPrompt from "./SudoPrompt.svelte";
  import RouteFields from "./RouteFields.svelte";
  const runtime = getRuntime(),
    adapter = runtime.adapter as DoorChatAdapter,
    control = adapter.controlPlane;
  const elevation = new Elevation(adapter.authorizeTask);
  let alive = true;
  let current = $state.raw<RouteSelection | null>(null),
    edited = $state(false),
    selection = $state.raw(untrack(() => runtime.route));
  let loading = $state(!!control),
    pending = $state(false),
    unconfirmed = $state(false),
    accepted = $state(false),
    error = $state<string | null>(null),
    attempt = $state.raw<RouteSelection | null>(null);
  let draft = $derived(
    catalogDraft(runtime.providers, edited ? selection : current, selection),
  );
  let valid = $derived(
    runtime.providers
      .find((p) => p.id === draft.providerId)
      ?.models.some((m) => m.id === draft.modelId) ?? false,
  );
  let currentInCatalog = $derived(
    current &&
      runtime.providers
        .find((p) => p.id === current?.providerId)
        ?.models.some((m) => m.id === current?.modelId),
  );
  const label = (route: RouteSelection) =>
    selectionLabel(route, runtime.providers);
  async function read() {
    if (!control || !alive) return;
    loading = true;
    error = null;
    try {
      const value = await control.current();
      if (alive) {
        current = value;
        unconfirmed = false;
        accepted = false;
        attempt = null;
      }
    } catch (e) {
      if (alive)
        error =
          e instanceof Error
            ? e.message
            : "Control Plane current model lookup failed.";
    } finally {
      if (alive) loading = false;
    }
  }
  onMount(() => {
    void read();
    return () => {
      alive = false;
      elevation.dispose();
    };
  });
  async function apply() {
    if (!control || pending || unconfirmed || !valid || !alive) return;
    const requested = draft;
    attempt = requested;
    pending = true;
    accepted = false;
    error = null;
    try {
      await control.set(requested, async (...args) => {
        if (!alive) throw new Error("Model selection context changed.");
        await elevation.elevate(...args);
        if (!alive) throw new Error("Model selection context changed.");
      });
    } catch (e) {
      if (alive) {
        pending = false;
        unconfirmed = e instanceof ControlPlaneMutationUnconfirmedError;
        error =
          e instanceof Error
            ? e.message
            : "Control Plane model selection failed.";
      }
      return;
    }
    if (!alive) return;
    accepted = true;
    unconfirmed = true;
    try {
      const value = await control.current();
      if (alive) {
        current = value;
        unconfirmed = false;
        error = sameSelection(value, requested)
          ? null
          : "The returned current model differs from the requested provider and model.";
      }
    } catch (e) {
      if (alive)
        error =
          e instanceof Error
            ? e.message
            : "Current Control Plane model readback failed.";
    } finally {
      if (alive) pending = false;
    }
  }
  async function reload() {
    loading = !!control;
    await runtime.refreshProviders();
    if (alive) await read();
  }
</script>

<RouteFields
  providers={runtime.providers}
  {draft}
  setDraft={(value) => {
    selection = value;
    edited = true;
  }}
  disabled={loading || pending}
  refresh={runtime.refreshProviders}
/>
<div class="route-catalog model-picker__actions">
  <button
    disabled={!control ||
      loading ||
      pending ||
      unconfirmed ||
      sameSelection(current, draft) ||
      !valid}
    onclick={() => void apply()}
    >{pending ? "Elevating and applying…" : "Elevate and apply model"}</button
  ><button
    disabled={loading || pending || runtime.catalogPending}
    onclick={() => void reload()}
    >{runtime.catalogPending ? "Refreshing…" : "Refresh models"}</button
  >
</div>
<div class="model-picker__state">
  <p class="model-picker__current">
    <span>Current model</span>{!control
      ? "Unavailable through this identity's adapter"
      : loading
        ? "Reading current model…"
        : unconfirmed
          ? "Unconfirmed · refresh to read current model"
          : current
            ? label(current)
            : "Current model was not returned"}
  </p>
  <p class="route-status" role="status" aria-live="polite">
    {!control
      ? "Control Plane model selection is unavailable through this identity's adapter."
      : pending
        ? `Applying ${label(attempt ?? draft)}`
        : unconfirmed && attempt
          ? `${accepted ? "Change sent" : "Change outcome unknown"} for ${label(attempt)}; current model unconfirmed. Refresh before applying another model.`
          : loading
            ? "Reading the current Control Plane model."
            : !valid
              ? "Choose a model from the catalog to enable elevation."
              : sameSelection(current, draft)
                ? "This is already the current Control Plane model. Choose a different model to enable elevation."
                : "Changing the Control Plane model requires a root password for this task."}
  </p>
  {#if error}<p class="route-status route-status--error" role="alert">
      {attempt
        ? unconfirmed
          ? `${accepted ? "Change sent" : "Change outcome unknown"} for ${label(attempt)}; current model unconfirmed: `
          : accepted
            ? `Change sent for ${label(attempt)}; readback differs: `
            : `Could not apply ${label(attempt)}: `
        : "Control Plane model: "}{error}
    </p>{/if}
  {#if current && !currentInCatalog && !loading && !unconfirmed}<p
      class="route-status"
    >
      Current route is not in the shared catalog. Choose a catalog model to
      change it.
    </p>{/if}
  {#if runtime.catalogError}<p role="alert">
      Model catalog: {runtime.catalogError}
    </p>{/if}
  {#if !runtime.providers.length}<p>No provider is configured.</p>{/if}
</div>
<SudoPrompt {elevation} />
