import { z } from "zod";

// Read-only consumer of the maintained compliance-index mappings/route/scope
// outputs. This is not a second mapping source or a live backend transport.
const text = z.string().min(1).max(8192);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const count = z.number().int().nonnegative();
const groups = z.array(text).max(10000);
const proof = z.object({
  source: text,
  sha256: digest,
}).catchall(z.unknown());

const registrySchema = z.object({
  generation: digest,
  schema_version: z.literal(1),
  retrieval_policy: z.literal("explicit_mappings_first"),
  assertions: count,
  historical_assertions: count,
  unresolved_targets: count,
  contract: text,
});

const nodeSchema = z.object({
  id: text,
  namespace: text,
  version: text,
  kind: text,
  local_id: text,
  title: text,
  status: text,
  data: z.record(z.string(), z.unknown()),
});

const routeSchema = z.object({
  generation: digest,
  tag: text,
  // A missing tag has no nodes/paths and omits this field in the maintained CLI.
  retrieval_policy: z.literal("explicit_mappings_first").optional(),
  nodes: z.array(nodeSchema).max(10000),
  paths: z.array(z.object({
    src: text,
    dst: text,
    kind: text,
    status: text,
    evidence: proof,
  })).max(10000),
  truncated: z.boolean(),
});

const filterSchema = z.object({
  must: z.tuple([z.object({
    key: z.literal("group_id"),
    match: z.object({ any: groups }).strict(),
  }).strict()]),
}).strict();

const scopeSchema = z.object({
  generation: digest,
  collection: text,
  allowed_groups: groups,
  qdrant_filter: filterSchema.nullable(),
});

const bundleSchema = z.object({
  registry: registrySchema,
  route: routeSchema,
  scope: scopeSchema,
});

export type ComplianceEvidence = z.infer<typeof bundleSchema>;
export type ComplianceNode = z.infer<typeof nodeSchema>;
export type ComplianceSemanticScope =
  | { available: false; reason: string }
  | {
      available: true;
      generation: string;
      collection: string;
      filter: z.infer<typeof filterSchema>;
    };

export function parseComplianceEvidence(input: unknown): ComplianceEvidence {
  const result = bundleSchema.parse(input);
  const { registry, route, scope } = result;
  if (registry.generation !== route.generation || registry.generation !== scope.generation) {
    throw new Error("Compliance mappings and vector scope belong to different generations. Reload them together.");
  }
  if (route.nodes.length > 0 && !route.retrieval_policy) {
    throw new Error("Compliance route is missing its explicit-mappings retrieval policy.");
  }
  const ids = new Set(route.nodes.map((node) => node.id));
  if (ids.size !== route.nodes.length || route.paths.some((path) => !ids.has(path.src) || !ids.has(path.dst))) {
    throw new Error("Compliance route contains duplicate nodes or unresolved path endpoints.");
  }
  const allowed = new Set(scope.allowed_groups);
  if (allowed.size !== scope.allowed_groups.length) {
    throw new Error("Compliance vector scope contains duplicate group IDs.");
  }
  if (allowed.size === 0) {
    if (scope.qdrant_filter !== null) {
      throw new Error("An empty compliance vector scope must return no semantic results.");
    }
  } else {
    const filtered = scope.qdrant_filter?.must[0].match.any;
    if (!filtered || filtered.length !== allowed.size || new Set(filtered).size !== allowed.size || filtered.some((id) => !allowed.has(id))) {
      throw new Error("Compliance vector filter does not match its verified allowed groups.");
    }
  }
  return result;
}

/** Call only after parsing the mappings, route and scope as one coherent bundle. */
export function complianceSemanticScope(evidence: ComplianceEvidence): ComplianceSemanticScope {
  // Revalidate at the query boundary too: TypeScript types are not authority.
  const { scope } = parseComplianceEvidence(evidence);
  if (scope.allowed_groups.length === 0 || scope.qdrant_filter === null) {
    return { available: false, reason: "No verified vector groups cover this selection. Semantic search must return no results." };
  }
  return {
    available: true,
    generation: scope.generation,
    collection: scope.collection,
    filter: scope.qdrant_filter,
  };
}

export function complianceNodeStatus(node: ComplianceNode): string {
  if (node.status === "unresolved_reference") return "Unresolved reference";
  if (node.status === "historical") return "Historical";
  if (node.status === "source_asserted") return "Source assertion";
  if (node.status === "verified") return "Source verified";
  return node.status;
}
