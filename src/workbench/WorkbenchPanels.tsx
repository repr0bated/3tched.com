import { useState } from "react";
import { useChatRuntime } from "../chat/ChatRuntimeProvider";
import { useWorkbench } from "./WorkbenchProvider";
import { CompliancePanel } from "./CompliancePanel";

export function WorkbenchPanels() {
  const { view } = useWorkbench();
  const { providers, chatContext } = useChatRuntime();
  const [schemaTag, setSchemaTag] = useState("");
  const [target, setTarget] = useState("");
  const [executionRole, setExecutionRole] = useState("ovs_openflow");
  const [inspectDraft, setInspectDraft] = useState(false);
  const candidates = providers.flatMap(provider => provider.models.map(model => ({
    key: JSON.stringify([provider.id, model.id]), provider: provider.id, model: model.id,
    label: `${provider.label} / ${model.label}`,
  })));
  const candidate = candidates.find(entry => entry.key === target);
  return <>
    <section className="workbench-feature-panel" aria-label="Compliance mappings and evidence" hidden={view !== "compliance"}>
      <CompliancePanel />
    </section>
    <section className="workbench-feature-panel" aria-label="Schema routing draft" hidden={view !== "routing"}>
      <header><p className="eyebrow">SCHEMA / TARGET / ADMISSION</p><h2>Propose a routing association</h2><span className="workbench-unconnected">Draft only</span></header>
      <p>Inspect a local proposal. Schema-tag routing, policy checks, and network activation are not connected.</p>
      <div className="workbench-draft-fields">
        <label>Schema tag<input value={schemaTag} maxLength={200} onChange={event => setSchemaTag(event.target.value)} placeholder="e.g. compliance.policy" /></label>
        <label>Candidate model<select value={target} onChange={event => setTarget(event.target.value)}>
          <option value="">Select a registered model</option>
          {target && !candidate ? <option value={target} disabled>Candidate no longer listed</option> : null}
          {candidates.map(entry => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
        </select></label>
        <label>Execution role<select value={executionRole} onChange={event => setExecutionRole(event.target.value)}>
          <option value="ovs_openflow">OVS / OpenFlow dataplane</option>
          <option value="xray_proxy">Xray proxy</option>
        </select></label>
      </div>
      <dl className="workbench-facts">
        <div><dt>Policy / grant decision</dt><dd>Not evaluated · requires admitted backend checks</dd></div>
        <div><dt>Local model</dt><dd>Gemma inference is not connected; registered model choices alone do not prove local execution</dd></div>
        <div><dt>Current session</dt><dd>{chatContext?.mode ?? "Offline workbench"}</dd></div>
        <div><dt>Enforcement</dt><dd>Not applied</dd></div>
      </dl>
      <button type="button" aria-pressed={inspectDraft} onClick={() => setInspectDraft(!inspectDraft)}>Inspect local draft</button>
      {inspectDraft ? <pre aria-label="Local routing draft">{JSON.stringify({
        schemaTag: schemaTag.trim() || null,
        candidateProviderId: candidate?.provider ?? null,
        candidateModelId: candidate?.model ?? null,
        executionRole, admission: "not_evaluated", enforcement: "not_applied",
      }, null, 2)}</pre> : null}
    </section>
  </>;
}
