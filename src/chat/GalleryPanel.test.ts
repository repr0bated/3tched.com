import { afterEach, describe, expect, it, vi } from "vitest";
import GalleryPanel from "../svelte/GalleryPanel.svelte";
import { act, cleanup, fireEvent, render, screen } from "../test/native";
import type { Candidate, CatalogEntry, Suggestion, UiGallery } from "./ui-gallery";

const spec = { root: "title", elements: { title: { type: "text", props: { text: "Submitted canvas", className: null } } } };
const suggestion: Suggestion = {
  suggestion_id: "submission", from_principal: "creator", candidate_id: "candidate",
  title: "Submitted canvas", spec_hash: "a".repeat(64), profile_sha256: "b".repeat(64),
  submitted_at: "2026-10-22T00:00:00Z", spec,
};
const entry: CatalogEntry = {
  entry_id: "entry", name: "Shared canvas", description: "", spec,
  spec_hash: suggestion.spec_hash, profile_sha256: suggestion.profile_sha256,
  from_candidate_id: suggestion.candidate_id, created_by: "creator", promoted_by: "reviewer",
  promoted_at: "2026-10-22T00:00:00Z", status: "active",
};
function fixture(canPromote = false, canRetire = false) {
  let candidate: Candidate = {
    candidate_id: "candidate", principal_id: "creator", title: "My private draft", mode: "ui_render",
    spec_hash: suggestion.spec_hash, profile_sha256: suggestion.profile_sha256, spec,
    created_at: "2026-10-22T00:00:00Z", prompt: "PRIVATE ORIGINAL PROMPT",
  };
  let pending = true;
  const gallery: UiGallery = {
    getAccess: vi.fn(async () => ({ can_promote: canPromote, can_retire: canRetire })),
    saveCandidate: vi.fn(async () => candidate),
    listCandidates: vi.fn(async () => ({ items: [candidate], nextBefore: null, total: 1 })),
    getCandidate: vi.fn(async () => candidate),
    deleteCandidate: vi.fn(async () => true),
    suggestCandidate: vi.fn(async () => {
      candidate = { ...candidate, submission: { suggestion_id: suggestion.suggestion_id, submitted_at: suggestion.submitted_at } };
      return candidate;
    }),
    listSuggestions: vi.fn(async () => ({ items: pending ? [suggestion] : [], nextBefore: null, total: pending ? 1 : 0 })),
    getSuggestion: vi.fn(async () => suggestion),
    promoteCandidate: vi.fn(async () => { pending = false; return entry; }),
    listCatalog: vi.fn(async () => ({ items: [entry], nextBefore: null, total: 1 })),
    getCatalogEntry: vi.fn(async () => entry),
    retireCatalogEntry: vi.fn(async () => ({ ...entry, status: "retired" as const })),
    activeCatalog: vi.fn(async () => [entry]),
  };
  return { gallery, onShow: vi.fn(), elevate: vi.fn(async () => undefined) };
}

afterEach(cleanup);

describe("gallery submission and root review", () => {
  it("lets a nonroot creator submit without publishing or exposing root controls", async () => {
    const props = fixture();
    render(GalleryPanel, { ...props, view: "candidates" });
    const submit = await screen.findByRole("button", { name: "Suggest promotion" });
    expect(screen.queryByRole("button", { name: "Review suggestions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve and publish" })).not.toBeInTheDocument();
    await act(async () => fireEvent.click(submit));
    expect(screen.getByText(/Awaiting root review/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Suggest promotion" })).not.toBeInTheDocument();
    expect(props.gallery.promoteCandidate).not.toHaveBeenCalled();
    expect(props.elevate).not.toHaveBeenCalled();
    expect(screen.queryByText("PRIVATE ORIGINAL PROMPT")).not.toBeInTheDocument();
  });

  it("requires a submitted preview and publishes its exact owner/hash without sudo", async () => {
    const props = fixture(true);
    render(GalleryPanel, { ...props, view: "candidates" });
    await screen.findByRole("button", { name: "Suggest promotion" });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Review suggestions" })));
    expect(screen.queryByRole("button", { name: "Approve and publish" })).not.toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Preview for approval" })));
    expect(screen.getByRole("region", { name: "Submitted canvas preview" })).toHaveTextContent("Submitted canvas");
    expect(props.onShow).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox", { name: "Catalog name" }), { target: { value: "Shared canvas" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Approve and publish" })));
    expect(props.gallery.promoteCandidate).toHaveBeenCalledExactlyOnceWith(suggestion, "Shared canvas", "");
    expect(props.elevate).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Creator: creator; approved by: reviewer");
    expect(screen.queryByRole("button", { name: "Preview for approval" })).not.toBeInTheDocument();
  });

  it("clears stale approval after a submission is deleted or rejected", async () => {
    const props = fixture(true);
    vi.mocked(props.gallery.promoteCandidate).mockRejectedValue(new Error("suggestion is no longer pending"));
    render(GalleryPanel, { ...props, view: "candidates" });
    await screen.findByRole("button", { name: "Suggest promotion" });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Review suggestions" })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Preview for approval" })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Approve and publish" })));
    expect(screen.getByRole("status")).toHaveTextContent("suggestion is no longer pending");
    expect(screen.queryByRole("button", { name: "Approve and publish" })).not.toBeInTheDocument();
    expect(props.elevate).not.toHaveBeenCalled();
  });

  it("fails closed on missing authoritative access while keeping private drafts usable", async () => {
    const props = fixture(true);
    vi.mocked(props.gallery.getAccess).mockRejectedValue(new Error("access unavailable"));
    render(GalleryPanel, { ...props, view: "candidates" });
    await screen.findByRole("button", { name: "Suggest promotion" });
    expect(screen.queryByRole("button", { name: "Review suggestions" })).not.toBeInTheDocument();
    expect(props.gallery.listSuggestions).not.toHaveBeenCalled();
  });

  it("retains retirement controls for their separate nonroot grant", async () => {
    const props = fixture(false, true);
    render(GalleryPanel, { ...props, view: "catalog" });
    await screen.findByRole("button", { name: "Retire" });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retire" })));
    expect(props.gallery.retireCatalogEntry).toHaveBeenCalledExactlyOnceWith("entry", "", props.elevate);
    expect(props.gallery.promoteCandidate).not.toHaveBeenCalled();
  });
});
