import { useCallback, useEffect, useState } from "react";
import type { Spec } from "@json-render/core";
import type { CandidateSummary, CatalogEntrySummary, UiGallery } from "./ui-gallery";

type View = "candidates" | "catalog";

function when(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

function message(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

/**
 * The two json_render galleries: the caller's saved candidates (no count
 * limit, loaded a page at a time) and the system-wide active catalog.
 * Showing an item puts its canvas on the workspace; Promote and Retire go
 * through the door and are refused there without the promote grant.
 */
export function GalleryPanel({
  gallery,
  view,
  onShow,
  refreshKey,
}: {
  gallery: UiGallery;
  view: View;
  onShow: (spec: Spec) => void;
  refreshKey: number;
}) {
  const [candidates, setCandidates] = useState<CandidateSummary[]>([]);
  const [entries, setEntries] = useState<CatalogEntrySummary[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const load = useCallback(
    async (before: string | null) => {
      setLoading(true);
      setError(null);
      try {
        if (view === "candidates") {
          const page = await gallery.listCandidates(before);
          setCandidates((previous) => (before ? [...previous, ...page.items] : page.items));
          setNext(page.nextBefore);
          setTotal(page.total);
        } else {
          const page = await gallery.listCatalog(before);
          setEntries((previous) => (before ? [...previous, ...page.items] : page.items));
          setNext(page.nextBefore);
          setTotal(page.total);
        }
      } catch (cause) {
        setError(message(cause, "The gallery could not be read."));
      } finally {
        setLoading(false);
      }
    },
    [gallery, view],
  );

  useEffect(() => {
    // Reload from the first page when the view changes or a save lands.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(null);
  }, [load, refreshKey]);

  async function show(id: string) {
    setError(null);
    try {
      const spec = view === "candidates"
        ? (await gallery.getCandidate(id)).spec
        : (await gallery.getCatalogEntry(id)).spec;
      onShow(spec);
    } catch (cause) {
      setError(message(cause, "That canvas could not be opened."));
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await gallery.deleteCandidate(id);
      setStatus("Candidate deleted.");
      await load(null);
    } catch (cause) {
      setError(message(cause, "The candidate was not deleted."));
    }
  }

  async function promote(id: string) {
    setError(null);
    try {
      const entry = await gallery.promoteCandidate(id, name, description);
      setStatus(`Promoted to the catalog as “${entry.name}”.`);
      setPromoting(null);
      setName("");
      setDescription("");
      await load(null);
    } catch (cause) {
      setError(message(cause, "The candidate was not promoted."));
    }
  }

  async function retire(id: string) {
    setError(null);
    try {
      const entry = await gallery.retireCatalogEntry(id);
      setStatus(`Retired “${entry.name}” from the catalog.`);
      await load(null);
    } catch (cause) {
      setError(message(cause, "The entry was not retired."));
    }
  }

  const empty = view === "candidates" ? candidates.length === 0 : entries.length === 0;

  return (
    <section className="gallery-panel" aria-label={view === "candidates" ? "Candidate gallery" : "Active catalog"}>
      <header className="gallery-panel__header">
        <h2>{view === "candidates" ? "Candidates" : "Active catalog"}</h2>
        <span>{total} {view === "candidates" ? "saved" : "active"}</span>
      </header>
      <p className="gallery-panel__hint">
        {view === "candidates"
          ? "Canvases you kept from chat. UI render keeps every canvas it draws. Promote one to add it to the catalog."
          : "Promoted compositions every user sees. The chat modes compose from these."}
      </p>
      {empty && !loading ? <p className="gallery-panel__empty">Nothing here yet.</p> : null}
      <ul className="gallery-list">
        {view === "candidates"
          ? candidates.map((item) => (
              <li key={item.candidate_id} className="gallery-item">
                <div className="gallery-item__main">
                  <strong>{item.title}</strong>
                  <small>
                    {item.mode.replaceAll("_", " ")} · {when(item.created_at)}
                    {item.promoted_entry_id ? " · promoted" : ""}
                  </small>
                </div>
                <div className="gallery-item__actions">
                  <button type="button" onClick={() => void show(item.candidate_id)}>Show</button>
                  {item.promoted_entry_id ? null : (
                    <button
                      type="button"
                      aria-expanded={promoting === item.candidate_id}
                      onClick={() => {
                        setPromoting(promoting === item.candidate_id ? null : item.candidate_id);
                        setName(item.title);
                        setDescription("");
                      }}
                    >
                      Promote
                    </button>
                  )}
                  <button type="button" onClick={() => void remove(item.candidate_id)}>Delete</button>
                </div>
                {promoting === item.candidate_id ? (
                  <form
                    className="gallery-promote"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void promote(item.candidate_id);
                    }}
                  >
                    <label>
                      <span>Catalog name</span>
                      <input value={name} maxLength={200} required onChange={(event) => setName(event.target.value)} />
                    </label>
                    <label>
                      <span>Description</span>
                      <textarea value={description} maxLength={2000} rows={2} onChange={(event) => setDescription(event.target.value)} />
                    </label>
                    <button type="submit" disabled={!name.trim()}>Promote to catalog</button>
                  </form>
                ) : null}
              </li>
            ))
          : entries.map((item) => (
              <li key={item.entry_id} className="gallery-item">
                <div className="gallery-item__main">
                  <strong>{item.name}</strong>
                  <small>{item.description || "No description"} · {when(item.promoted_at)}</small>
                </div>
                <div className="gallery-item__actions">
                  <button type="button" onClick={() => void show(item.entry_id)}>Show</button>
                  <button type="button" onClick={() => void retire(item.entry_id)}>Retire</button>
                </div>
              </li>
            ))}
      </ul>
      {next ? (
        <button type="button" className="gallery-more" disabled={loading} onClick={() => void load(next)}>
          {loading ? "Loading" : "Load older"}
        </button>
      ) : null}
      <p className={error ? "route-status route-status--error" : "route-status"} role="status" aria-live="polite">
        {error ?? status ?? (loading ? "Loading." : "")}
      </p>
    </section>
  );
}
