import { useCallback, useState, type ReactNode } from "react";

/**
 * Per-task sudo elevation. A protected call (the Control Plane model,
 * catalog promote and retire) first needs a one-time ticket from the
 * `elevation` plugin for that exact call: plugin, method and arguments. The
 * user types their current sudo password each time; it goes over the door
 * once, in `authorize_task`, and is never kept here.
 */
export type Elevate = (plugin: string, method: string, args: Record<string, unknown>) => Promise<void>;
export type AuthorizeTask = (
  plugin: string,
  method: string,
  args: Record<string, unknown>,
  password: string,
) => Promise<void>;

const TASK_LABELS: Record<string, string> = {
  "tched_router.config_set": "Change the Control Plane model",
  "json_render.promote_candidate": "Promote to the catalog",
  "json_render.retire_catalog_entry": "Retire from the catalog",
};

interface Pending {
  plugin: string;
  method: string;
  args: Record<string, unknown>;
  resolve: () => void;
  reject: (error: Error) => void;
}

export function useSudoPrompt(authorize?: AuthorizeTask): [Elevate, ReactNode] {
  const [pending, setPending] = useState<Pending | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const elevate = useCallback<Elevate>(
    (plugin, method, args) =>
      new Promise<void>((resolve, reject) => {
        if (!authorize) {
          reject(new Error("Sudo elevation is unavailable without the door."));
          return;
        }
        setPassword("");
        setError(null);
        setPending({ plugin, method, args, resolve, reject });
      }),
    [authorize],
  );

  async function submit() {
    if (!pending || !authorize || !password) return;
    setBusy(true);
    setError(null);
    try {
      await authorize(pending.plugin, pending.method, pending.args, password);
      setPassword("");
      setPending(null);
      pending.resolve();
    } catch (cause) {
      setPassword("");
      setError(cause instanceof Error ? cause.message : "Sudo password was not accepted.");
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    pending?.reject(new Error("Sudo elevation cancelled."));
    setPassword("");
    setError(null);
    setPending(null);
  }

  const label = pending ? TASK_LABELS[`${pending.plugin}.${pending.method}`] ?? "Protected task" : "";
  const element = pending ? (
    <form
      className="sudo-prompt"
      role="dialog"
      aria-modal="true"
      aria-label={`${label}: sudo password`}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") cancel();
      }}
    >
      <p className="sudo-prompt__title">{label}</p>
      <label>
        <span>Sudo password</span>
        <input
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          disabled={busy}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <div className="sudo-prompt__actions">
        <button type="submit" disabled={busy || !password}>
          {busy ? "Checking" : "Authorize"}
        </button>
        <button type="button" onClick={cancel} disabled={busy}>
          Cancel
        </button>
      </div>
      <p className={error ? "route-status route-status--error" : "route-status"} role="status" aria-live="polite">
        {error ?? "Asked for each protected change; nothing stays unlocked."}
      </p>
    </form>
  ) : null;

  return [elevate, element];
}
