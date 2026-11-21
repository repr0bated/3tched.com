import { writable } from "svelte/store";

export interface PendingToolApproval {
  turn_id: string;
  tool_call_id: string;
  plugin_id: string;
  method: string;
  arguments: unknown;
  required_capability: string;
  digest: string;
  expires_at: string;
  decision: string;
}
interface ApprovalPrompt { proposal: PendingToolApproval; decide(approved: boolean): void }
export const pendingToolApproval = writable<ApprovalPrompt | null>(null);
let active: ApprovalPrompt | null = null;

/** Only the separate catalog control resolves this decision, never chat text. */
export function requestToolApproval(proposal: PendingToolApproval, signal?: AbortSignal): Promise<boolean> {
  if (active) return Promise.reject(new Error("Another tool approval is already open."));
  const { promise, resolve, reject } = Promise.withResolvers<boolean>();
  const remaining = Date.parse(proposal.expires_at) - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0) return Promise.reject(new Error("Tool approval expired."));
  const expiry = setTimeout(() => finish(), Math.min(remaining, 300_000));
  const finish = (approved?: boolean) => {
    clearTimeout(expiry);
    signal?.removeEventListener("abort", abort);
    if (active === prompt) { active = null; pendingToolApproval.set(null); }
    if (approved === undefined) reject(new Error("Tool approval cancelled; no approval was sent."));
    else resolve(approved);
  };
  const abort = () => finish();
  const prompt: ApprovalPrompt = { proposal, decide: finish };
  if (signal?.aborted) { reject(new Error("Tool approval cancelled.")); return promise; }
  active = prompt;
  pendingToolApproval.set(prompt);
  signal?.addEventListener("abort", abort, { once: true });
  return promise;
}
