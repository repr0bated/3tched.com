import { describe, expect, it } from "vitest";
import capture from "./__fixtures__/compliance-ac2.json";
import { complianceNodeStatus, complianceSemanticScope, parseComplianceEvidence } from "./compliance-contract";

// Captured from maintained compliance-index c651f896472f963a37754bcc886f9fe85eebf6cc
// on 2026-09-30: mappings -> route nist-sp800-53:rev5:ac-2 -> scope --tag ... .
// This is test evidence, not an assertion that the current backend is connected.
const copy = () => structuredClone(capture);

describe("maintained compliance retrieval boundary", () => {
  it("preserves actual mapped evidence and refuses semantic retrieval without current vectors", () => {
    const evidence = parseComplianceEvidence(capture);
    expect(evidence.registry.assertions).toBe(3047);
    expect(evidence.route.tag).toBe("nist-sp800-53:rev5:ac-2");
    expect(evidence.route.paths).toEqual(capture.route.paths);
    expect(complianceSemanticScope(evidence)).toMatchObject({ available: false });
  });

  it("rejects mixed generations across graph and vector scope", () => {
    const input = copy();
    input.scope.generation = "a".repeat(64);
    expect(() => parseComplianceEvidence(input)).toThrow(/different generations/);
  });

  it("preserves an exact current scope filter and rejects broader or absent filters", () => {
    const scope = {
      ...capture.scope,
      allowed_groups: ["test-only-verified-group"],
      qdrant_filter: { must: [{ key: "group_id", match: { any: ["test-only-verified-group"] } }] },
    };
    const evidence = parseComplianceEvidence({ ...capture, scope });
    expect(complianceSemanticScope(evidence)).toMatchObject({ available: true, filter: scope.qdrant_filter });
    expect(() => parseComplianceEvidence({ ...capture, scope: { ...scope, qdrant_filter: null } })).toThrow(/filter/);
    expect(() => parseComplianceEvidence({ ...capture, scope: { ...scope, qdrant_filter: {} } })).toThrow();
    const extra = { must: [{ key: "group_id", match: { any: ["test-only-verified-group", "historical-group"] } }] };
    expect(() => parseComplianceEvidence({ ...capture, scope: { ...scope, qdrant_filter: extra } })).toThrow(/allowed groups/);
  });

  it("accepts the maintained unknown-tag response with no policy field and no nodes", () => {
    const route = { generation: capture.route.generation, tag: "unknown:test", nodes: [], paths: [], truncated: false };
    expect(parseComplianceEvidence({ ...capture, route }).route.nodes).toEqual([]);
  });

  it("rejects dangling paths rather than displaying invented graph nodes", () => {
    const input = copy();
    input.route.nodes = [];
    expect(() => parseComplianceEvidence(input)).toThrow(/path endpoints/);
  });

  it("keeps source assertions distinct from unresolved target verification", () => {
    const node = { ...parseComplianceEvidence(capture).route.nodes[0], status: "unresolved_reference" };
    expect(complianceNodeStatus(node)).toBe("Unresolved reference");
    expect(complianceNodeStatus({ ...node, status: "source_asserted" })).toBe("Source assertion");
    expect(complianceNodeStatus({ ...node, status: "verified" })).toBe("Source verified");
  });
});
