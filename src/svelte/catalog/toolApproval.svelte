<script lang="ts">
  import { pendingToolApproval } from "../../chat/pending-tool-approval";
  let dialog: HTMLDialogElement;
  $effect(() => {
    if (!dialog) return;
    if ($pendingToolApproval && !dialog.open) dialog.showModal();
    else if (!$pendingToolApproval && dialog.open) dialog.close();
  });
</script>

<dialog bind:this={dialog} aria-label="Confirm chat operation" oncancel={(event) => {
  event.preventDefault();
  $pendingToolApproval?.decide(false);
}}>
  {#if $pendingToolApproval}
    <h2>Approve this operation?</h2>
    <p>The chatbot cannot approve its own changes. This permission applies once to these exact arguments.</p>
    <p><strong>{$pendingToolApproval.proposal.plugin_id}.{$pendingToolApproval.proposal.method}</strong></p>
    <p>Capability: {$pendingToolApproval.proposal.required_capability}</p>
    <pre>{JSON.stringify($pendingToolApproval.proposal.arguments, null, 2)}</pre>
    <p>Expires: {$pendingToolApproval.proposal.expires_at}</p>
    <p><small>Digest: {$pendingToolApproval.proposal.digest}</small></p>
    <button type="button" onclick={() => $pendingToolApproval?.decide(false)}>Reject</button>
    <button type="button" onclick={() => $pendingToolApproval?.decide(true)}>Approve exact operation</button>
  {/if}
</dialog>

<style>
  dialog { color: inherit; background: var(--background, #171717); max-width: min(42rem, 90vw); max-height: 85vh; overflow: auto; border: 1px solid currentColor; border-radius: .5rem; }
  dialog::backdrop { background: rgb(0 0 0 / .6); }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; }
  button { margin: .5rem; }
  button:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }
</style>
