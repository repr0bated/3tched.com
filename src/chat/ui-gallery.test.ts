import { describe, expect, it } from "vitest";
import type { DoorClient } from "../grpc/door";
import { catalogPresentationMessage } from "../json-render/references/reference-chat";
import {
  GALLERY_CAPABILITY,
  JSON_RENDER,
  PROMOTE_CAPABILITY,
  RETIRE_CAPABILITY,
  candidateTitle,
  clipBytes,
  uiGallery,
  type CatalogEntry,
  type SuggestionSummary,
} from "./ui-gallery";

const spec = {
  root: "page",
  elements: { page: { type: "text", props: { text: "hi", className: null } } },
};

const source: SuggestionSummary = {
  suggestion_id: "suggestion",
  from_principal: "creator",
  candidate_id: "candidate",
  title: "Status",
  spec_hash: "a".repeat(64),
  profile_sha256: "b".repeat(64),
  submitted_at: "2026-10-22T00:00:00Z",
};

function entry(id: string, name: string): CatalogEntry {
  return {
    entry_id: id,
    name,
    description: "",
    spec,
    spec_hash: "a".repeat(64),
    profile_sha256: "b".repeat(64),
    from_candidate_id: "c",
    created_by: "creator",
    promoted_by: "p",
    promoted_at: "2026-09-28T00:00:00Z",
    status: "active",
  } as CatalogEntry;
}

function fakeClient(results: Record<string, unknown>) {
  const calls: Array<{ plugin: string; method: string; args: Record<string, unknown>; capability: string }> = [];
  const client = {
    async call(plugin: string, method: string, args: Record<string, unknown>, capability: string) {
      calls.push({ plugin, method, args, capability });
      return { result: results[method] };
    },
  } as unknown as DoorClient;
  return { client, calls };
}

describe("ui gallery client", () => {
  it("calls the sealed json_render methods with their exact grants", async () => {
    const { client, calls } = fakeClient({
      save_candidate: { candidate: { candidate_id: "1" } },
      list_candidates: { candidates: [], next_before: "x", total: 3 },
      promote_candidate: { entry: entry("e", "Status") },
      list_catalog: { entries: [], total: 0 },
      retire_catalog_entry: { entry: entry("e", "Status") },
    });
    const gallery = uiGallery(client);
    await gallery.saveCandidate({ spec, title: "Draw my network\nmore", mode: "ui_render", prompt: "Draw my network" });
    const page = await gallery.listCandidates("before-id", 10);
    await gallery.promoteCandidate(source, " Status ", " desc ");
    await gallery.listCatalog();
    await gallery.retireCatalogEntry("e");
    expect(page).toEqual({ items: [], nextBefore: "x", total: 3 });
    expect(calls.every((call) => call.plugin === JSON_RENDER)).toBe(true);
    expect(calls.map((call) => [call.method, call.capability])).toEqual([
      ["save_candidate", GALLERY_CAPABILITY],
      ["list_candidates", GALLERY_CAPABILITY],
      ["promote_candidate", PROMOTE_CAPABILITY],
      ["list_catalog", GALLERY_CAPABILITY],
      ["retire_catalog_entry", RETIRE_CAPABILITY],
    ]);
    expect(calls[0].args).toMatchObject({ title: "Draw my network", mode: "ui_render", prompt: "Draw my network" });
    expect(calls[1].args).toEqual({ limit: 10, before: "before-id" });
    expect(calls[2].args).toEqual({
      suggestion_id: source.suggestion_id, from_principal: source.from_principal,
      candidate_id: source.candidate_id, expected_spec_hash: source.spec_hash,
      name: "Status", description: "desc",
    });
  });

  it("caches the active catalog until a promotion changes it", async () => {
    const { client, calls } = fakeClient({
      list_catalog: { entries: [{ entry_id: "e" }], total: 1 },
      get_catalog_entry: { entry: entry("e", "Status") },
      promote_candidate: { entry: entry("f", "Other") },
    });
    const gallery = uiGallery(client);
    expect((await gallery.activeCatalog()).map((item) => item.name)).toEqual(["Status"]);
    await gallery.activeCatalog();
    expect(calls.filter((call) => call.method === "list_catalog")).toHaveLength(1);
    await gallery.promoteCandidate(source, "Other", "");
    await gallery.activeCatalog();
    expect(calls.filter((call) => call.method === "list_catalog")).toHaveLength(2);
  });

  it("clips titles on character boundaries within the byte limit", () => {
    expect(clipBytes("ééé", 5)).toBe("éé");
    expect(new TextEncoder().encode(candidateTitle("€".repeat(300))).length).toBeLessThanOrEqual(200);
    expect(candidateTitle("\n\n  ")).toBe("Untitled canvas");
    expect(candidateTitle("a\tb")).toBe("a b");
  });
});

describe("catalog in prompts", () => {
  it("offers promoted compositions to ordinary chat while keeping UI render proposals independent", () => {
    const catalog = [entry("e", "Promoted status page")];
    expect(catalogPresentationMessage("status", "project", null, catalog)).toContain("Promoted status page");
    expect(catalogPresentationMessage("status", "personal", null, catalog)).toContain("Promoted status page");
    expect(catalogPresentationMessage("status", undefined, null, catalog)).toContain("Promoted status page");
    expect(catalogPresentationMessage("status", "ui_render", null, catalog)).not.toContain("Promoted status page");
    expect(catalogPresentationMessage("status", "personal")).not.toContain("Promoted catalog compositions");
  });
});

describe("clipBytes", () => {
  it("never splits a multi-byte character", () => {
    expect(clipBytes("a€b", 3)).toBe("a");
    expect(clipBytes("a€b", 4)).toBe("a€");
    expect(clipBytes("😀x", 3)).toBe("");
    expect(clipBytes("short", 200)).toBe("short");
  });
});

describe("catalog elevation", () => {
  it("promotes without elevation but retains retirement's exact elevated arguments", async () => {
    const { client, calls } = fakeClient({
      promote_candidate: { entry: entry("e", "Status") },
      retire_catalog_entry: { entry: entry("e", "Status") },
    });
    const elevated: Array<{ method: string; args: Record<string, unknown> }> = [];
    const gallery = uiGallery(client);
    await gallery.promoteCandidate(source, " Status ", "");
    await gallery.retireCatalogEntry("e", "", async (_plugin, method, args) => {
      elevated.push({ method, args });
    });
    expect(elevated.map((item) => item.method)).toEqual(["retire_catalog_entry"]);
    expect(calls.filter((call) => call.method === "retire_catalog_entry").map((call) => call.args))
      .toEqual(elevated.map((item) => item.args));
  });
});
