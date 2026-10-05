<script lang="ts">
  import {
    complianceNodeStatus,
    complianceSemanticScope,
    parseComplianceEvidence,
  } from "../workbench/compliance-contract";
  let { evidence }: { evidence?: unknown } = $props();
  let result = $derived.by(() => {
    try {
      return {
        parsed:
          evidence === undefined
            ? undefined
            : parseComplianceEvidence(evidence),
        error: "",
      };
    } catch (e) {
      return {
        parsed: undefined,
        error: e instanceof Error ? e.message : "Invalid evidence bundle.",
      };
    }
  });
  let parsed = $derived(result.parsed),
    scope = $derived(parsed ? complianceSemanticScope(parsed) : undefined);
</script>

<header>
  <p class="eyebrow">POLICY / PROVENANCE</p>
  <h2>Compliance workspace</h2>
  <span class="workbench-unconnected">Live lookup not connected</span>
</header>
<p>
  Policies follow explicit Cozo mapping relationships. Qdrant evidence supports
  retrieval within the active verified generation.
</p>
{#if result.error}<p role="alert">
    Evidence bundle rejected: {result.error}
  </p>{/if}
<dl class="workbench-facts">
  <div>
    <dt>Explicit mappings</dt>
    <dd>
      {parsed
        ? `${parsed.route.paths.length} supplied relationships`
        : "No graph response loaded"}
    </dd>
  </div>
  <div>
    <dt>Source documents</dt>
    <dd>
      {parsed
        ? `${parsed.route.nodes.filter((n) => n.kind === "document").length} source document nodes`
        : "No source evidence loaded"}
    </dd>
  </div>
  <div>
    <dt>Unresolved references</dt>
    <dd>
      {parsed
        ? `${parsed.route.nodes.filter((n) => n.status === "unresolved_reference").length} unresolved targets in this route`
        : "Unknown until a graph response is loaded"}
    </dd>
  </div>
  <div>
    <dt>Verification status</dt>
    <dd>
      {parsed
        ? "Supplied bundle validated; each node retains its source status"
        : "Unverified · live adapter unavailable"}
    </dd>
  </div>
</dl>
{#if parsed}<p>Generation <code>{parsed.registry.generation}</code></p>
  <p>
    {parsed.route.truncated
      ? "Route is truncated; remaining relationships are not displayed."
      : "Supplied traversal paths; not a complete graph."}
  </p>
  <ul>
    {#each parsed.route.nodes.slice(0, 20) as node (node.id)}<li>
        {node.title}
        <small
          >{node.namespace} · {node.version} · {complianceNodeStatus(
            node,
          )}</small
        >
      </li>{/each}
  </ul>
  <details>
    <summary>Mapping provenance</summary
    >{#each parsed.route.paths.slice(0, 20) as path, index (index)}<article>
        <p><code>{path.src}</code> → <code>{path.dst}</code></p>
        <p>{path.kind} · {path.status}</p>
        <pre>{JSON.stringify(path.evidence, null, 2)}</pre>
      </article>{/each}
  </details>
  {#if parsed.route.nodes.length > 20 || parsed.route.paths.length > 20}<p>
      Showing the first 20 nodes and relationships from the supplied bundle.
    </p>{/if}{/if}
<p>
  {scope?.available
    ? "Verified vector scope is present; semantic search still needs a connected adapter."
    : (scope?.reason ?? "An empty scope authorizes no semantic query.")}
</p>
<p>Similarity does not establish a control mapping.</p>
