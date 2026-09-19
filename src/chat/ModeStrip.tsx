import { useEffect, useState } from "react";
import type { ChatAdapter } from "./chat-adapter";
import type { DoorChatAdapter } from "./door-chat-adapter";
import { CHAT_MODES, type ChatMode, type ProjectSummary, type ResolvedChatContext } from "./chat-mode";

function isDoorAdapter(adapter: ChatAdapter): adapter is DoorChatAdapter {
  return adapter.kind === "remote" && typeof (adapter as DoorChatAdapter).selectChatMode === "function";
}

/**
 * Which partition of the principal's memory this session uses. The door
 * decides and persists; this only shows what it said and asks for a change.
 */
export function ModeStrip({ adapter }: { adapter: ChatAdapter }) {
  const [context, setContext] = useState<ResolvedChatContext | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [namespace, setNamespace] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isDoorAdapter(adapter)) return;
    let cancelled = false;
    void adapter
      .getChatContext()
      .then((ctx) => {
        if (!cancelled) setContext(ctx);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "mode unavailable"));
    void adapter
      .listProjects()
      .then((list) => !cancelled && setProjects(list))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [adapter]);

  if (!isDoorAdapter(adapter) || !context) return null;

  const select = async (mode: ChatMode, projectId?: string, personalNamespace?: string) => {
    setBusy(true);
    setError(null);
    try {
      setContext(await adapter.selectChatMode({ mode, projectId, personalNamespace }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "selection refused");
    } finally {
      setBusy(false);
    }
  };

  const current = CHAT_MODES.find((m) => m.id === context.mode);

  return (
    <div className="mode-strip" aria-label="Chat mode">
      <label>
        Mode
        <select
          value={context.mode}
          disabled={busy}
          onChange={(e) => void select(e.target.value as ChatMode, projects[0]?.project_id)}
        >
          {CHAT_MODES.map((m) => (
            <option key={m.id} value={m.id} title={m.hint}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      {context.mode === "project" && (
        <label>
          Project
          <select
            value={context.project_id ?? ""}
            disabled={busy}
            onChange={(e) => void select("project", e.target.value)}
          >
            {projects.map((p) => (
              <option key={p.project_id} value={p.project_id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {context.mode === "personal" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void select("personal", undefined, namespace.trim() || undefined);
          }}
        >
          <input
            placeholder="sub-space (a-z0-9_-)"
            value={namespace}
            disabled={busy}
            onChange={(e) => setNamespace(e.target.value)}
          />
        </form>
      )}
      <span className="mode-strip__namespace" title={current?.hint}>
        {context.mode === "ui_render" ? "no memory" : context.memory_namespace}
        {context.read_only && context.mode !== "ui_render" ? " · read-only" : ""}
      </span>
      {error && <span className="mode-strip__error">{error}</span>}
    </div>
  );
}
