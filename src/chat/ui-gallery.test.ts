import { describe, expect, it } from "vitest";
import type { DoorClient } from "../grpc/door";
import { catalogPresentationMessage } from "../json-render/references/reference-chat";
import {
  GALLERY_CAPABILITY,
  JSON_RENDER,
  PROMOTE_CAPABILITY,
  candidateTitle,
  clipBytes,
  uiGallery,
  type CatalogEntry,
} from "./ui-gallery";

const spec = {
  root: "page",
  elements: { page: { type: "text", props: { text: "hi", className: null } } },
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
    await gallery.promoteCandidate("1", " Status ", " desc ");
    await gallery.listCatalog();
    await gallery.retireCatalogEntry("e");
    expect(page).toEqual({ items: [], nextBefore: "x", total: 3 });
    expect(calls.every((call) => call.plugin === JSON_RENDER)).toBe(true);
    expect(calls.map((call) => [call.method, call.capability])).toEqual([
      ["save_candidate", GALLERY_CAPABILITY],
      ["list_candidates", GALLERY_CAPABILITY],
      ["promote_candidate", PROMOTE_CAPABILITY],
      ["list_catalog", GALLERY_CAPABILITY],
      ["retire_catalog_entry", PROMOTE_CAPABILITY],
    ]);
    expect(calls[0].args).toMatchObject({ title: "Draw my network", mode: "ui_render", prompt: "Draw my network" });
    expect(calls[1].args).toEqual({ limit: 10, before: "before-id" });
    expect(calls[2].args).toEqual({ candidate_id: "1", name: "Status", description: "desc" });
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
    await gallery.promoteCandidate("c", "Other", "");
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
  it("offers promoted compositions to normal modes but not to UI render", () => {
    const catalog = [entry("e", "Promoted status page")];
    expect(catalogPresentationMessage("status", "personal", null, catalog)).toContain("Promoted status page");
    expect(catalogPresentationMessage("status", "ui_render", null, catalog)).not.toContain("Promoted status page");
    expect(catalogPresentationMessage("status", "personal")).not.toContain("Promoted catalog compositions");
  });
});
