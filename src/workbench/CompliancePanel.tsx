import {
  complianceNodeStatus,
  complianceSemanticScope,
  parseComplianceEvidence,
  type ComplianceEvidence,
} from "./compliance-contract";

/** No implicit fixture or transport. A future admitted adapter supplies its bundle. */
export function CompliancePanel({ evidence }: { evidence?: unknown }) {
  let parsed: ComplianceEvidence | undefined;
  let error: string | undefined;
  if (evidence !== undefined) {
    try { parsed = parseComplianceEvidence(evidence); }
    catch (cause) { error = cause instanceof Error ? cause.message : "Invalid evidence bundle."; }
  }
  const scope = parsed ? complianceSemanticScope(parsed) : undefined;
  return <>
    <header><p className="eyebrow">POLICY / PROVENANCE</p><h2>Compliance workspace</h2><span className="workbench-unconnected">Live lookup not connected</span></header>
    <p>Policies follow explicit Cozo mapping relationships. Qdrant evidence supports retrieval within the active verified generation.</p>
    {error ? <p role="alert">Evidence bundle rejected: {error}</p> : null}
    <dl className="workbench-facts">
      <div><dt>Explicit mappings</dt><dd>{parsed ? `${parsed.route.paths.length} supplied relationships` : "No graph response loaded"}</dd></div>
      <div><dt>Source documents</dt><dd>{parsed ? `${parsed.route.nodes.filter(node => node.kind === "document").length} source document nodes` : "No source evidence loaded"}</dd></div>
      <div><dt>Unresolved references</dt><dd>{parsed ? `${parsed.route.nodes.filter(node => node.status === "unresolved_reference").length} unresolved targets in this route` : "Unknown until a graph response is loaded"}</dd></div>
      <div><dt>Verification status</dt><dd>{parsed ? "Supplied bundle validated; each node retains its source status" : "Unverified · live adapter unavailable"}</dd></div>
    </dl>
    {parsed ? <>
      <p>Generation <code>{parsed.registry.generation}</code></p>
      <p>{parsed.route.truncated ? "Route is truncated; remaining relationships are not displayed." : "Supplied traversal paths; not a complete graph."}</p>
      <ul>{parsed.route.nodes.slice(0, 20).map(node => <li key={node.id}>{node.title} <small>{node.namespace} · {node.version} · {complianceNodeStatus(node)}</small></li>)}</ul>
      <details><summary>Mapping provenance</summary>{parsed.route.paths.slice(0, 20).map((path, index) => <article key={index}>
        <p><code>{path.src}</code> → <code>{path.dst}</code></p>
        <p>{path.kind} · {path.status}</p>
        <pre>{JSON.stringify(path.evidence, null, 2)}</pre>
      </article>)}</details>
      {parsed.route.nodes.length > 20 || parsed.route.paths.length > 20 ? <p>Showing the first 20 nodes and relationships from the supplied bundle.</p> : null}
    </> : null}
    <p>{scope?.available ? "Verified vector scope is present; semantic search still needs a connected adapter." : scope?.reason ?? "An empty scope authorizes no semantic query."}</p>
    <p>Similarity does not establish a control mapping.</p>
  </>;
}
