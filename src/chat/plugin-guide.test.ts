import { describe, expect, it, vi } from "vitest";
import type { DoorClient } from "../grpc/door";
import { readPluginGuide, readUiAuthoringGuide, SelectionGuide } from "./plugin-guide";

const selectedPath = "references/upstream/json-render/svelte-guide.md";
const selectedDocument = {
  path: selectedPath,
  content: "Selected reference content.",
  repository: "https://github.com/example/docs",
  revision: "0123456789abcdef0123456789abcdef01234567",
  source_path: "docs/svelte-guide.md",
  sha256: "b".repeat(64),
};
const makeDocument = (index: number, content: string) => ({
  ...selectedDocument,
  path: `references/skill-${index}.md`,
  source_path: `skills/skill-${index}.md`,
  content,
  sha256: index.toString(16).padStart(64, "0"),
});
function authoringSchema(uiAuthoring: unknown = {
  format: "threetched-ui-authoring-v1",
  instructions: "Use only the registered Svelte catalog and registry.",
  documents: [selectedDocument, { ...selectedDocument, path: "unselected/private-reference.md", content: "unselected-doc-secret" }],
  prompt_document_paths: [selectedPath],
}) {
  return {
    plugin_id: "json_render",
    schema_hash: "d".repeat(64),
    schema: { name: "json_render", fields: {
      ui_authoring: { default: uiAuthoring }, secret: { default: "schema-secret" },
    }, methods: { hidden: { description: "method-secret" } } },
  };
}

describe("sealed selection guide", () => {
  it("reads the root guide through the admitted operation and excludes private fields", async () => {
    const call = vi.fn().mockResolvedValue({ result: { plugin_id: "example", schema_hash: "a".repeat(64), schema: {
      name: "example", description: "[chatbot-guide:v1] public guidance", fields: { secret: "private-fixture" },
      methods: { run: { description: "method text is not the guide" } },
    } } });
    const guide = await readPluginGuide({ call } as unknown as Pick<DoorClient, "call">, "example");
    expect(call).toHaveBeenCalledWith("cognitive_mcp", "schema_read", { plugin_id: "example" }, "cognitive_mcp.read");
    expect(guide).toContain("public guidance");
    expect(guide).not.toContain("private-fixture");
    expect(guide).not.toContain("method text");
  });
  it("reads once per selection, refreshes on provider change and identity invalidation", async () => {
    const read = vi.fn().mockResolvedValue("guide"); const guides = new SelectionGuide(read);
    await guides.select("a"); await guides.select("a"); expect(read).toHaveBeenCalledTimes(1);
    await guides.select("b"); expect(read).toHaveBeenCalledTimes(2);
    guides.reset(); await guides.select("b"); expect(read).toHaveBeenCalledTimes(3);
  });
  it("rejects a stale in-flight read after a provider change", async () => {
    let finish!: (value: string) => void;
    const read = vi.fn().mockImplementationOnce(() => new Promise<string>(resolve => { finish = resolve; })).mockResolvedValue("new");
    const guides = new SelectionGuide(read); const old = guides.select("a");
    await expect(guides.select("b")).resolves.toBe("new");
    finish("old"); await expect(old).rejects.toThrow("Guide selection changed");
    await expect(guides.select("b")).resolves.toBe("new");
  });
  it("preserves a denial and never caches a failed read", async () => {
    const error = new Error("permission denied"); const read = vi.fn().mockRejectedValueOnce(error).mockResolvedValue("guide");
    const guides = new SelectionGuide(read);
    await expect(guides.select("a")).rejects.toBe(error);
    await expect(guides.select("a")).resolves.toBe("guide");
  });
  it("rejects an old schema without an explicitly published guide", async () => {
    const call = vi.fn().mockResolvedValue({ result: { plugin_id: "example", schema_hash: "a".repeat(64), schema: { name: "example", description: "catalog" } } });
    await expect(readPluginGuide({ call } as unknown as Pick<DoorClient, "call">, "example")).rejects.toThrow("unavailable or invalid");
  });
});

describe("sealed UI-authoring guide", () => {
  it("attaches only selected documents with their sealed provenance", async () => {
    const call = vi.fn().mockResolvedValue({ result: authoringSchema() });
    const guide = await readUiAuthoringGuide({ call } as unknown as Pick<DoorClient, "call">);
    expect(call).toHaveBeenCalledWith("cognitive_mcp", "schema_read", { plugin_id: "json_render" }, "cognitive_mcp.read");
    expect(guide).toContain("Use only the registered Svelte catalog and registry.");
    expect(guide).toContain("Selected reference content.");
    expect(guide).toContain("Repository: https://github.com/example/docs");
    expect(guide).toContain(`SHA-256: ${"b".repeat(64)}`);
    expect(guide).not.toContain("unselected-doc-secret");
    expect(guide).not.toContain("schema-secret");
    expect(guide).not.toContain("method-secret");
  });

  it("explains packaging adaptation for a selected upstream reference", async () => {
    const adapted = {
      ...selectedDocument,
      upstream_sha256: "c".repeat(64),
      adaptation: "Converted repository-relative links to sealed document paths.",
    };
    const call = vi.fn().mockResolvedValue({ result: authoringSchema({
      format: "threetched-ui-authoring-v1",
      instructions: "Use the reference as packaged.",
      documents: [adapted],
      prompt_document_paths: [selectedPath],
    }) });
    const guide = await readUiAuthoringGuide({ call } as unknown as Pick<DoorClient, "call">);
    expect(guide).toContain(`SHA-256: ${"b".repeat(64)}`);
    expect(guide).toContain(`Upstream SHA-256: ${"c".repeat(64)}`);
    expect(guide).toContain("Packaging adaptation: Converted repository-relative links to sealed document paths.");
  });

  it("accepts the 34-document, 15-reference runtime set above the former prompt limit", async () => {
    const documents = Array.from({ length: 34 }, (_, index) => makeDocument(index, index < 15 ? `selected-${index}-` + "s".repeat(4600) : `unselected-${index}-secret`));
    const selectedPaths = documents.slice(0, 15).map(document => document.path);
    const call = vi.fn().mockResolvedValue({ result: authoringSchema({
      format: "threetched-ui-authoring-v1",
      instructions: "Use only the registered Svelte catalog and registry.",
      documents,
      prompt_document_paths: selectedPaths,
    }) });
    const guide = await readUiAuthoringGuide({ call } as unknown as Pick<DoorClient, "call">);
    expect(guide.length).toBeGreaterThan(64 * 1024);
    expect(guide.length).toBeLessThanOrEqual(96 * 1024);
    expect(guide.match(/\[Sealed reference:/g)).toHaveLength(15);
    expect(guide).toContain("selected-14-");
    expect(guide).not.toContain("unselected-15-secret");
  });

  it.each([
    ["wrong plugin", { ...authoringSchema(), plugin_id: "model_registry" }],
    ["wrong format", authoringSchema({ format: "other", instructions: "x", documents: [], prompt_document_paths: [] })],
    ["empty document set", authoringSchema({ format: "threetched-ui-authoring-v1", instructions: "x", documents: [], prompt_document_paths: [selectedPath] })],
    ["empty prompt document selection", authoringSchema({ format: "threetched-ui-authoring-v1", instructions: "x", documents: [selectedDocument], prompt_document_paths: [] })],
    ["missing selected document", authoringSchema({ format: "threetched-ui-authoring-v1", instructions: "x", documents: [selectedDocument], prompt_document_paths: ["references/missing.md"] })],
    ["duplicate selected document", authoringSchema({ format: "threetched-ui-authoring-v1", instructions: "x", documents: [selectedDocument], prompt_document_paths: [selectedPath, selectedPath] })],
    ["excessive prompt instructions", authoringSchema({ format: "threetched-ui-authoring-v1", instructions: "x".repeat(16 * 1024 + 1), documents: [selectedDocument], prompt_document_paths: [selectedPath] })],
    ["invalid document digest", authoringSchema({ format: "threetched-ui-authoring-v1", instructions: "x", documents: [{ ...selectedDocument, sha256: "invalid" }], prompt_document_paths: [selectedPath] })],
    ["invalid document revision", authoringSchema({ format: "threetched-ui-authoring-v1", instructions: "x", documents: [{ ...selectedDocument, revision: "0123456789abcdef" }], prompt_document_paths: [selectedPath] })],
    ["missing adaptation metadata pair", authoringSchema({ format: "threetched-ui-authoring-v1", instructions: "x", documents: [{ ...selectedDocument, upstream_sha256: "c".repeat(64) }], prompt_document_paths: [selectedPath] })],
    ["missing upstream digest pair", authoringSchema({ format: "threetched-ui-authoring-v1", instructions: "x", documents: [{ ...selectedDocument, adaptation: "Adjusted links." }], prompt_document_paths: [selectedPath] })],
    ["invalid upstream digest", authoringSchema({ format: "threetched-ui-authoring-v1", instructions: "x", documents: [{ ...selectedDocument, upstream_sha256: "invalid", adaptation: "Adjusted links." }], prompt_document_paths: [selectedPath] })],
    ["empty adaptation reason", authoringSchema({ format: "threetched-ui-authoring-v1", instructions: "x", documents: [{ ...selectedDocument, upstream_sha256: "c".repeat(64), adaptation: "  " }], prompt_document_paths: [selectedPath] })],
    ["duplicate document path", authoringSchema({ format: "threetched-ui-authoring-v1", instructions: "x", documents: [selectedDocument, selectedDocument], prompt_document_paths: [selectedPath] })],
    ["oversized selected prompt", authoringSchema({ format: "threetched-ui-authoring-v1", instructions: "x", documents: [{ ...selectedDocument, content: "x".repeat(96 * 1024) }], prompt_document_paths: [selectedPath] })],
    ["too many documents", authoringSchema({ format: "threetched-ui-authoring-v1", instructions: "x", documents: Array.from({ length: 41 }, (_, index) => makeDocument(index, "doc")), prompt_document_paths: ["references/skill-0.md"] })],
    ["oversized document set", authoringSchema({ format: "threetched-ui-authoring-v1", instructions: "x", documents: [{ ...selectedDocument, content: "x".repeat(129 * 1024) }, { ...selectedDocument, path: "references/second.md", content: "y".repeat(129 * 1024) }], prompt_document_paths: [selectedPath] })],
  ])("rejects %s", async (_label, result) => {
    const call = vi.fn().mockResolvedValue({ result });
    await expect(readUiAuthoringGuide({ call } as unknown as Pick<DoorClient, "call">)).rejects.toThrow();
  });
});
