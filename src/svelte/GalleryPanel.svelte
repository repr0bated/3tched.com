<script lang="ts">
  import { onMount } from "svelte";
  import type { Spec } from "@json-render/core";
  import type {
    CandidateSummary,
    CatalogEntrySummary,
    UiGallery,
  } from "../chat/ui-gallery";
  import type { Elevate } from "../chat/elevation";
  let {
    gallery,
    view,
    onShow,
    elevate,
  }: {
    gallery: UiGallery;
    view: "candidates" | "catalog";
    onShow: (spec: Spec) => void;
    elevate?: Elevate;
  } = $props();
  let candidates = $state.raw<CandidateSummary[]>([]),
    entries = $state.raw<CatalogEntrySummary[]>([]),
    next = $state<string | null>(null),
    total = $state(0);
  let loading = $state(false),
    busy = $state(false),
    status = $state(""),
    error = $state(""),
    promoting = $state<string | null>(null),
    name = $state(""),
    description = $state("");
  let alive = true;
  const when = (iso: string) =>
    Number.isNaN(Date.parse(iso)) ? iso : new Date(iso).toLocaleString();
  async function load(before: string | null) {
    if (!alive || loading) return;
    loading = true;
    error = "";
    try {
      if (view === "candidates") {
        const page = await gallery.listCandidates(before);
        if (alive) {
          candidates = before ? [...candidates, ...page.items] : page.items;
          next = page.nextBefore;
          total = page.total;
        }
      } else {
        const page = await gallery.listCatalog(before);
        if (alive) {
          entries = before ? [...entries, ...page.items] : page.items;
          next = page.nextBefore;
          total = page.total;
        }
      }
    } catch (e) {
      if (alive)
        error =
          e instanceof Error ? e.message : "The gallery could not be read.";
    } finally {
      if (alive) loading = false;
    }
  }
  onMount(() => {
    void load(null);
    return () => {
      alive = false;
    };
  });
  async function action(
    kind: "show" | "delete" | "promote" | "retire",
    id: string,
  ) {
    if (busy || !alive) return;
    busy = true;
    error = "";
    try {
      if (kind === "show") {
        const item =
          view === "candidates"
            ? await gallery.getCandidate(id)
            : await gallery.getCatalogEntry(id);
        if (alive) onShow(item.spec);
      }
      if (kind === "delete") {
        await gallery.deleteCandidate(id);
        if (alive) status = "Candidate deleted.";
      }
      if (kind === "promote") {
        const item = await gallery.promoteCandidate(
          id,
          name,
          description,
          elevate,
        );
        if (alive) {
          status = `Promoted to the catalog as “${item.name}”.`;
          promoting = null;
          name = "";
          description = "";
        }
      }
      if (kind === "retire") {
        const item = await gallery.retireCatalogEntry(id, "", elevate);
        if (alive) status = `Retired “${item.name}” from the catalog.`;
      }
      if (alive && kind !== "show") await load(null);
    } catch (e) {
      if (alive)
        error =
          e instanceof Error ? e.message : "The gallery operation failed.";
    } finally {
      if (alive) busy = false;
    }
  }
</script>

<section
  class="gallery-panel"
  aria-label={view === "candidates" ? "Candidate gallery" : "Active catalog"}
>
  <header class="gallery-panel__header">
    <h2>{view === "candidates" ? "Candidates" : "Active catalog"}</h2>
    <span>{total} {view === "candidates" ? "saved" : "active"}</span>
  </header>
  <p class="gallery-panel__hint">
    {view === "candidates"
      ? "Canvases you kept from chat. UI render keeps every canvas it draws. Promote one to add it to the catalog."
      : "Promoted compositions every user sees. The chat modes compose from these."}
  </p>
  {#if !(view === "candidates" ? candidates.length : entries.length) && !loading}<p
    >
      Nothing here yet.
    </p>{/if}
  <ul class="gallery-list">
    {#if view === "candidates"}{#each candidates as item (item.candidate_id)}<li
          class="gallery-item"
        >
          <div class="gallery-item__main">
            <strong>{item.title}</strong><small
              >{item.mode.replaceAll("_", " ")} · {when(
                item.created_at,
              )}{item.promoted_entry_id ? " · promoted" : ""}</small
            >
          </div>
          <div class="gallery-item__actions">
            <button
              disabled={busy}
              onclick={() => void action("show", item.candidate_id)}
              >Show</button
            >{#if !item.promoted_entry_id}<button
                disabled={busy}
                aria-expanded={promoting === item.candidate_id}
                onclick={() => {
                  promoting =
                    promoting === item.candidate_id ? null : item.candidate_id;
                  name = item.title;
                  description = "";
                }}>Promote</button
              >{/if}<button
              disabled={busy || loading}
              onclick={() => void action("delete", item.candidate_id)}
              >Delete</button
            >
          </div>
          {#if promoting === item.candidate_id}<form
              class="gallery-promote"
              onsubmit={(e) => {
                e.preventDefault();
                void action("promote", item.candidate_id);
              }}
            >
              <label
                ><span>Catalog name</span><input
                  bind:value={name}
                  maxlength="200"
                  required
                /></label
              ><label
                ><span>Description</span><textarea
                  bind:value={description}
                  maxlength="2000"
                  rows="2"></textarea></label
              ><button type="submit" disabled={busy || loading || !name.trim()}
                >Promote to catalog</button
              >
            </form>{/if}
        </li>{/each}{:else}{#each entries as item (item.entry_id)}<li
          class="gallery-item"
        >
          <div class="gallery-item__main">
            <strong>{item.name}</strong><small
              >{item.description || "No description"} · {when(
                item.promoted_at,
              )}</small
            >
          </div>
          <div class="gallery-item__actions">
            <button
              disabled={busy}
              onclick={() => void action("show", item.entry_id)}>Show</button
            ><button
              disabled={busy || loading}
              onclick={() => void action("retire", item.entry_id)}
              >Retire</button
            >
          </div>
        </li>{/each}{/if}
  </ul>
  {#if next}<button
      class="gallery-more"
      disabled={loading || busy}
      onclick={() => void load(next)}
      >{loading ? "Loading" : "Load older"}</button
    >{/if}
  <p
    class="route-status"
    class:route-status--error={!!error}
    role="status"
    aria-live="polite"
  >
    {error || status || (loading ? "Loading." : "")}
  </p>
</section>
