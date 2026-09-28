import type { Spec } from "@json-render/core";
import type { ChatMode } from "./chat-mode";
import type { DoorClient } from "../grpc/door";

/**
 * The json_render UI gallery and active catalog, through the door.
 *
 * Candidates are the caller's own saved canvases (no count limit, paged
 * newest first). The catalog is system-wide: promoted compositions every
 * user reads, and the normal chat modes compose from. Method names and
 * capability ids are the sealed json_render schema's.
 */
export const JSON_RENDER = "json_render";
export const GALLERY_CAPABILITY = "json_render.gallery";
export const PROMOTE_CAPABILITY = "json_render.promote";

export interface CandidateSummary {
  candidate_id: string;
  title: string;
  mode: string;
  spec_hash: string;
  created_at: string;
  promoted_entry_id?: string | null;
}

export interface Candidate extends CandidateSummary {
  principal_id: string;
  prompt?: string | null;
  spec: Spec;
  profile_sha256: string;
}

export interface CatalogEntrySummary {
  entry_id: string;
  name: string;
  description: string;
  spec_hash: string;
  promoted_at: string;
  status: "active" | "retired";
}

export interface CatalogEntry extends CatalogEntrySummary {
  spec: Spec;
  profile_sha256: string;
  from_candidate_id: string;
  promoted_by: string;
  retired_at?: string | null;
  retired_by?: string | null;
  retire_reason?: string | null;
}

export interface Page<T> {
  items: T[];
  nextBefore: string | null;
  total: number;
}

export interface UiGallery {
  saveCandidate(request: { spec: Spec; title: string; mode: ChatMode; prompt?: string }): Promise<Candidate>;
  listCandidates(before?: string | null, limit?: number): Promise<Page<CandidateSummary>>;
  getCandidate(candidateId: string): Promise<Candidate>;
  deleteCandidate(candidateId: string): Promise<boolean>;
  promoteCandidate(candidateId: string, name: string, description: string): Promise<CatalogEntry>;
  listCatalog(before?: string | null, limit?: number, includeRetired?: boolean): Promise<Page<CatalogEntrySummary>>;
  getCatalogEntry(entryId: string): Promise<CatalogEntry>;
  retireCatalogEntry(entryId: string, reason?: string): Promise<CatalogEntry>;
  /** Active entries with their specs, newest first, cached briefly. */
  activeCatalog(limit?: number): Promise<CatalogEntry[]>;
}

const MAX_TITLE_BYTES = 200;
const MAX_PROMPT_BYTES = 8 * 1024;
const CATALOG_TTL_MS = 60_000;

/** Longest prefix of `text` within `bytes` UTF-8 bytes, never splitting a character. */
export function clipBytes(text: string, bytes: number): string {
  const encoded = new TextEncoder().encode(text);
  if (encoded.length <= bytes) return text;
  let end = Math.max(0, bytes);
  // Back up to the start of the character that would be split.
  while (end > 0 && (encoded[end] & 0xc0) === 0x80) end -= 1;
  return new TextDecoder().decode(encoded.subarray(0, end));
}

/** A gallery title from the request that produced a canvas. */
export function candidateTitle(request: string): string {
  const line = request.split("\n").find((part) => part.trim())?.trim() ?? "";
  // eslint-disable-next-line no-control-regex
  const clean = line.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return clipBytes(clean || "Untitled canvas", MAX_TITLE_BYTES).trim() || "Untitled canvas";
}

export function uiGallery(client: DoorClient): UiGallery {
  let cached: { at: number; limit: number; entries: CatalogEntry[] } | null = null;
  const forget = () => {
    cached = null;
  };

  async function call<T>(method: string, args: Record<string, unknown>, capability = GALLERY_CAPABILITY): Promise<T> {
    const { result } = await client.call<T>(JSON_RENDER, method, args, capability);
    return result;
  }

  const gallery: UiGallery = {
    async saveCandidate({ spec, title, mode, prompt }) {
      const clippedPrompt = prompt?.trim() ? clipBytes(prompt, MAX_PROMPT_BYTES) : undefined;
      const result = await call<{ candidate: Candidate }>("save_candidate", {
        spec,
        title: candidateTitle(title),
        mode,
        ...(clippedPrompt ? { prompt: clippedPrompt } : {}),
      });
      return result.candidate;
    },

    async listCandidates(before, limit = 20) {
      const result = await call<{ candidates: CandidateSummary[]; next_before?: string | null; total: number }>(
        "list_candidates",
        { limit, ...(before ? { before } : {}) },
      );
      return { items: result.candidates ?? [], nextBefore: result.next_before ?? null, total: result.total ?? 0 };
    },

    async getCandidate(candidateId) {
      return (await call<{ candidate: Candidate }>("get_candidate", { candidate_id: candidateId })).candidate;
    },

    async deleteCandidate(candidateId) {
      return (await call<{ deleted: boolean }>("delete_candidate", { candidate_id: candidateId })).deleted;
    },

    async promoteCandidate(candidateId, name, description) {
      const result = await call<{ entry: CatalogEntry }>(
        "promote_candidate",
        { candidate_id: candidateId, name: name.trim(), description: description.trim() },
        PROMOTE_CAPABILITY,
      );
      forget();
      return result.entry;
    },

    async listCatalog(before, limit = 20, includeRetired = false) {
      const result = await call<{ entries: CatalogEntrySummary[]; next_before?: string | null; total: number }>(
        "list_catalog",
        { limit, include_retired: includeRetired, ...(before ? { before } : {}) },
      );
      return { items: result.entries ?? [], nextBefore: result.next_before ?? null, total: result.total ?? 0 };
    },

    async getCatalogEntry(entryId) {
      return (await call<{ entry: CatalogEntry }>("get_catalog_entry", { entry_id: entryId })).entry;
    },

    async retireCatalogEntry(entryId, reason = "") {
      const result = await call<{ entry: CatalogEntry }>(
        "retire_catalog_entry",
        { entry_id: entryId, reason: reason.trim() },
        PROMOTE_CAPABILITY,
      );
      forget();
      return result.entry;
    },

    async activeCatalog(limit = 6) {
      if (cached && cached.limit === limit && Date.now() - cached.at < CATALOG_TTL_MS) return cached.entries;
      try {
        const page = await gallery.listCatalog(null, limit);
        const entries = await Promise.all(page.items.map((item) => gallery.getCatalogEntry(item.entry_id)));
        cached = { at: Date.now(), limit, entries };
        return entries;
      } catch (error) {
        // A failed refresh keeps the last catalog rather than dropping it.
        if (cached && cached.limit === limit) return cached.entries;
        throw error;
      }
    },
  };
  return gallery;
}
