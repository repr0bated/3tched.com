<script lang="ts">
  import { onMount } from "svelte";
  import type { Spec } from "@json-render/core";
  import type {
    CandidateSummary,
    CatalogEntrySummary,
    Suggestion,
    SuggestionSummary,
    UiGallery,
  } from "../chat/ui-gallery";
  import type { Elevate } from "../chat/elevation";
  import SpecRenderer from "./SpecRenderer.svelte";
  import { reviewLabel, reviewLane } from "../chat/review-lanes";

  let { gallery, view, onShow, elevate }: {
    gallery: UiGallery;
    view: "candidates" | "catalog";
    onShow: (spec: Spec) => void;
    elevate?: Elevate;
  } = $props();
  let candidates = $state.raw<CandidateSummary[]>([]);
  let entries = $state.raw<CatalogEntrySummary[]>([]);
  let suggestions = $state.raw<SuggestionSummary[]>([]);
  let reviewed = $state.raw<Suggestion | null>(null);
  let next = $state<string | null>(null);
  let total = $state(0);
  let canPromote = $state(false);
  let canRetire = $state(false);
  let reviewing = $state(false);
  let loading = $state(false);
  let busy = $state(false);
  let status = $state("");
  let error = $state("");
  let name = $state("");
  let description = $state("");
  let alive = true;
  let loadSequence = 0;
  const section = $derived(view === "candidates" && reviewing ? "suggestions" : view);
  const humanSuggestions = $derived(suggestions.filter((item) => reviewLane(item.title) === "human"));
  const catalogSuggestions = $derived(suggestions.filter((item) => reviewLane(item.title) !== "human"));
  const humanCandidates = $derived(candidates.filter((item) => reviewLane(item.title) === "human"));
  const catalogCandidates = $derived(candidates.filter((item) => reviewLane(item.title) === "catalog"));
  const otherCandidates = $derived(candidates.filter((item) => reviewLane(item.title) === null));
  const when = (iso: string) => Number.isNaN(Date.parse(iso)) ? iso : new Date(iso).toLocaleString();

  async function load(before: string | null) {
    if (!alive) return;
    const sequence = ++loadSequence;
    const selected = section;
    loading = true;
    error = "";
    try {
      if (selected === "candidates") {
        const page = await gallery.listCandidates(before);
        if (!alive || sequence !== loadSequence) return;
        candidates = before ? [...candidates, ...page.items] : page.items;
        next = page.nextBefore;
        total = page.total;
      } else if (selected === "suggestions") {
        const page = await gallery.listSuggestions(before);
        if (!alive || sequence !== loadSequence) return;
        suggestions = before ? [...suggestions, ...page.items] : page.items;
        next = page.nextBefore;
        total = page.total;
      } else {
        const page = await gallery.listCatalog(before);
        if (!alive || sequence !== loadSequence) return;
        entries = before ? [...entries, ...page.items] : page.items;
        next = page.nextBefore;
        total = page.total;
      }
    } catch (e) {
      if (alive && sequence === loadSequence)
        error = e instanceof Error ? e.message : "The gallery could not be read.";
    } finally {
      if (alive && sequence === loadSequence) loading = false;
    }
  }

  onMount(() => {
    void gallery.getAccess().then((access) => {
      if (alive) {
        canPromote = access.can_promote === true;
        canRetire = access.can_retire === true;
      }
    }).catch((e: unknown) => {
      if (alive) error = e instanceof Error ? e.message : "Gallery access could not be read.";
    });
    void load(null);
    return () => { alive = false; };
  });

  function selectReview(value: boolean) {
    reviewing = value;
    reviewed = null;
    status = "";
    next = null;
    total = 0;
    void load(null);
  }

  async function action(kind: "show" | "delete" | "suggest" | "review" | "promote" | "retire", id: string) {
    if (busy || !alive) return;
    busy = true;
    error = "";
    try {
      if (kind === "show") {
        const item = view === "candidates" ? await gallery.getCandidate(id) : await gallery.getCatalogEntry(id);
        if (alive) onShow(item.spec);
      } else if (kind === "review") {
        const item = await gallery.getSuggestion(id);
        if (alive) {
          reviewed = item;
          name = item.title;
          description = "";
          status = "Previewing the submitted canvas. Approval publishes this exact version to every user.";
        }
      } else if (kind === "delete") {
        await gallery.deleteCandidate(id);
        if (alive) status = "Candidate deleted; any pending suggestion was removed. Published catalog entries are unchanged.";
      } else if (kind === "suggest") {
        await gallery.suggestCandidate(id);
        if (alive) status = "Submitted for root review. Nothing has been published.";
      } else if (kind === "promote") {
        if (!reviewed || reviewed.suggestion_id !== id) throw new Error("Preview the current suggestion before approving it.");
        const item = await gallery.promoteCandidate(reviewed, name, description);
        if (alive) {
          status = `Published “${item.name}”. Creator: ${item.created_by}; approved by: ${item.promoted_by}.`;
          reviewed = null;
          name = "";
          description = "";
        }
      } else {
        const item = await gallery.retireCatalogEntry(id, "", elevate);
        if (alive) status = `Retired “${item.name}” from the catalog.`;
      }
      if (alive && kind !== "show" && kind !== "review") await load(null);
    } catch (e) {
      if (alive) {
        error = e instanceof Error ? e.message : "The gallery operation failed.";
        // Never offer a second approval of a stale/deleted/changed submission.
        if (kind === "promote" || kind === "review") reviewed = null;
      }
    } finally {
      if (alive) busy = false;
    }
  }
</script>

<section class="gallery-panel" aria-label={section === "suggestions" ? "Promotion review" : view === "candidates" ? "Candidate gallery" : "Active catalog"}>
  <header class="gallery-panel__header">
    <h2>{section === "suggestions" ? "Promotion suggestions" : view === "candidates" ? "Candidates" : "Active catalog"}</h2>
    <span>{total} {section === "suggestions" ? "pending" : view === "candidates" ? "saved" : "active"}</span>
  </header>
  {#if view === "candidates" && canPromote}
    <nav aria-label="Gallery view" class="gallery-item__actions">
      <button aria-pressed={!reviewing} disabled={busy || loading} onclick={() => selectReview(false)}>My candidates</button>
      <button aria-pressed={reviewing} disabled={busy || loading} onclick={() => selectReview(true)}>Review suggestions</button>
    </nav>
  {/if}
  <p class="gallery-panel__hint">
    {section === "suggestions"
      ? "Human review is for a component the chatbot already rendered. The second approver is the chatbot, the two-person check already in use. Catalog consideration is something a person chose in chat. Approval is what puts it in the catalog."
      : view === "candidates"
        ? "Two lists. Human review: the chatbot is already using it and a person still has to review it. Catalog candidates: you chose this in chat and it is waiting to be considered for the catalog. Nothing here is approved until a reviewer publishes it."
        : "Approved catalog. Creator and approver are recorded separately. Chat pages can use these names."}
  </p>
  <button disabled={loading || busy} onclick={() => void load(null)}>Refresh</button>
  {#if !(section === "suggestions" ? suggestions.length : view === "candidates" ? candidates.length : entries.length) && !loading}
    <p>Nothing here yet.</p>
  {/if}
  <ul class="gallery-list">
    {#if section === "suggestions"}
      {#if humanSuggestions.length}<li class="gallery-item"><strong>Human review</strong><small>Already rendered by the chatbot. Not approved.</small></li>{/if}
      {#each humanSuggestions as item (item.suggestion_id)}
        <li class="gallery-item">
          <div class="gallery-item__main">
            <strong>{reviewLabel(item.title)}</strong>
            <small>Human review · creator {item.from_principal} · submitted {when(item.submitted_at)}</small>
          </div>
          <div class="gallery-item__actions">
            <button disabled={busy || loading} aria-expanded={reviewed?.suggestion_id === item.suggestion_id} onclick={() => void action("review", item.suggestion_id)}>Preview for approval</button>
          </div>
          {#if reviewed?.suggestion_id === item.suggestion_id}
            <section aria-label="Submitted canvas preview">
              <SpecRenderer spec={reviewed.spec} />
            </section>
            <form class="gallery-promote" onsubmit={(e) => { e.preventDefault(); void action("promote", item.suggestion_id); }}>
              <small>Reviewed content SHA-256: {reviewed.spec_hash}</small>
              <label><span>Catalog name</span><input bind:value={name} maxlength="200" required /></label>
              <label><span>Description</span><textarea bind:value={description} maxlength="2000" rows="2"></textarea></label>
              <button type="submit" disabled={busy || loading || !name.trim()}>Approve and publish</button>
            </form>
          {/if}
        </li>
      {/each}
      {#if catalogSuggestions.length}<li class="gallery-item"><strong>Catalog consideration</strong><small>Chosen in chat. Waiting for a person to approve.</small></li>{/if}
      {#each catalogSuggestions as item (item.suggestion_id)}
        <li class="gallery-item">
          <div class="gallery-item__main">
            <strong>{reviewLabel(item.title)}</strong>
            <small>Catalog candidate · creator {item.from_principal} · submitted {when(item.submitted_at)}</small>
          </div>
          <div class="gallery-item__actions">
            <button disabled={busy || loading} aria-expanded={reviewed?.suggestion_id === item.suggestion_id} onclick={() => void action("review", item.suggestion_id)}>Preview for approval</button>
          </div>
          {#if reviewed?.suggestion_id === item.suggestion_id}
            <section aria-label="Submitted canvas preview">
              <SpecRenderer spec={reviewed.spec} />
            </section>
            <form class="gallery-promote" onsubmit={(e) => { e.preventDefault(); void action("promote", item.suggestion_id); }}>
              <small>Reviewed content SHA-256: {reviewed.spec_hash}</small>
              <label><span>Catalog name</span><input bind:value={name} maxlength="200" required /></label>
              <label><span>Description</span><textarea bind:value={description} maxlength="2000" rows="2"></textarea></label>
              <button type="submit" disabled={busy || loading || !name.trim()}>Approve and publish</button>
            </form>
          {/if}
        </li>
      {/each}
    {:else if view === "candidates"}
      {#if humanCandidates.length}<li class="gallery-item"><strong>Human review</strong><small>The chatbot is already using these. A person still has to review them.</small></li>{/if}
      {#each [...humanCandidates, ...catalogCandidates, ...otherCandidates] as item (item.candidate_id)}
        <li class="gallery-item">
          <div class="gallery-item__main">
            <strong>{reviewLabel(item.title)}</strong>
            <small>{reviewLane(item.title) === "human" ? "Human review" : reviewLane(item.title) === "catalog" ? "Catalog candidate" : item.mode.replaceAll("_", " ")} · {when(item.created_at)} · {item.promoted_entry_id ? "Approved" : item.submission ? "Needs review" : "Not submitted"}</small>
          </div>
          <div class="gallery-item__actions">
            <button disabled={busy} onclick={() => void action("show", item.candidate_id)}>Show</button>
            {#if !item.promoted_entry_id && !item.submission}
              <button disabled={busy || loading} onclick={() => void action("suggest", item.candidate_id)}>Suggest promotion</button>
            {/if}
            <button disabled={busy || loading} onclick={() => void action("delete", item.candidate_id)}>Delete</button>
          </div>
        </li>
      {/each}
    {:else}
      {#each entries as item (item.entry_id)}
        <li class="gallery-item">
          <div class="gallery-item__main">
            <strong>{item.name}</strong>
            <small>{item.description || "No description"} · {when(item.promoted_at)}</small>
            <small>Creator: {item.created_by} · approved by: {item.promoted_by}</small>
          </div>
          <div class="gallery-item__actions">
            <button disabled={busy} onclick={() => void action("show", item.entry_id)}>Show</button>
            {#if canRetire}
              <button disabled={busy || loading} onclick={() => void action("retire", item.entry_id)}>Retire</button>
            {/if}
          </div>
        </li>
      {/each}
    {/if}
  </ul>
  {#if next}
    <button class="gallery-more" disabled={loading || busy} onclick={() => void load(next)}>{loading ? "Loading" : "Load older"}</button>
  {/if}
  <p class="route-status" class:route-status--error={!!error} role="status" aria-live="polite">
    {error || status || (loading ? "Loading." : "")}
  </p>
</section>
