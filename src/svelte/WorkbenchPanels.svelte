<script lang="ts">
  import { getRuntime } from "./runtime.svelte";
  import CompliancePanel from "./CompliancePanel.svelte";
  import ZeroClawPanel from "./ZeroClawPanel.svelte";
  const runtime = getRuntime();
  let schemaTag = $state(""),
    target = $state(""),
    executionRole = $state("ovs_openflow"),
    inspectDraft = $state(false);
  let candidates = $derived(
    runtime.providers.flatMap((provider) =>
      provider.models.map((model) => ({
        key: JSON.stringify([provider.id, model.id]),
        provider: provider.id,
        model: model.id,
        label: `${provider.label} / ${model.label}`,
      })),
    ),
  );
  let candidate = $derived(candidates.find((entry) => entry.key === target));
</script>

<section
  class="workbench-feature-panel"
  aria-label="Compliance mappings and evidence"
  hidden={runtime.view !== "compliance"}
>
  <CompliancePanel />
</section>
{#if runtime.view === "zeroclaw"}<ZeroClawPanel />{/if}
<section
  class="workbench-feature-panel"
  aria-label="Schema routing draft"
  hidden={runtime.view !== "routing"}
>
  <header>
    <p class="eyebrow">SCHEMA / TARGET / ADMISSION</p>
    <h2>Propose a routing association</h2>
    <span class="workbench-unconnected">Draft only</span>
  </header>
  <p>
    Inspect a local proposal. Schema-tag routing, policy checks, and network
    activation are not connected.
  </p>
  <div class="workbench-draft-fields">
    <label
      >Schema tag<input
        bind:value={schemaTag}
        maxlength="200"
        placeholder="e.g. compliance.policy"
      /></label
    ><label
      >Candidate model<select bind:value={target}
        ><option value="">Select a registered model</option
        >{#if target && !candidate}<option value={target} disabled
            >Candidate no longer listed</option
          >{/if}{#each candidates as entry (entry.key)}<option value={entry.key}
            >{entry.label}</option
          >{/each}</select
      ></label
    ><label
      >Execution role<select bind:value={executionRole}
        ><option value="ovs_openflow">OVS / OpenFlow dataplane</option><option
          value="xray_proxy">Xray proxy</option
        ></select
      ></label
    >
  </div>
  <dl class="workbench-facts">
    <div>
      <dt>Policy / grant decision</dt>
      <dd>Not evaluated · requires admitted backend checks</dd>
    </div>
    <div>
      <dt>Local model</dt>
      <dd>
        Gemma inference is not connected; registered model choices alone do not
        prove local execution
      </dd>
    </div>
    <div>
      <dt>Current session</dt>
      <dd>{runtime.chatContext?.mode ?? "Offline workbench"}</dd>
    </div>
    <div>
      <dt>Enforcement</dt>
      <dd>Not applied</dd>
    </div>
  </dl>
  <button
    aria-pressed={inspectDraft}
    onclick={() => (inspectDraft = !inspectDraft)}>Inspect local draft</button
  >{#if inspectDraft}<pre aria-label="Local routing draft">{JSON.stringify(
        {
          schemaTag: schemaTag.trim() || null,
          candidateProviderId: candidate?.provider ?? null,
          candidateModelId: candidate?.model ?? null,
          executionRole,
          admission: "not_evaluated",
          enforcement: "not_applied",
        },
        null,
        2,
      )}</pre>{/if}
</section>
