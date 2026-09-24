import { useEffect, useState } from "react";
import type { ChatAdapter } from "./chat-adapter";
import type { DoorChatAdapter } from "./door-chat-adapter";
import { CHAT_MODES, defaultNotebook, notebookIdFromNamespace, type ChatMode, type NotebookSummary, type ProjectSummary, type ResolvedChatContext } from "./chat-mode";

function isDoorAdapter(adapter: ChatAdapter): adapter is DoorChatAdapter {
  return adapter.kind === "remote" && typeof (adapter as DoorChatAdapter).selectChatMode === "function";
}

/**
 * Which partition of the principal's memory this session uses. The door
 * decides and persists; this only shows what it said and asks for a change.
 */
export function ModeStrip({ adapter, onContextChange }: { adapter: ChatAdapter; onContextChange?: (context: ResolvedChatContext) => void }) {
  const [context, setContext] = useState<ResolvedChatContext | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectListError, setProjectListError] = useState<string | null>(null);
  const [projectPending, setProjectPending] = useState(false);
  const [notebooks, setNotebooks] = useState<NotebookSummary[]>([]);
  const [notebookListError, setNotebookListError] = useState<string | null>(null);
  const [notebookPending, setNotebookPending] = useState(false);
  const [defaultAttempt, setDefaultAttempt] = useState<string | null>(null);
  const [namespace, setNamespace] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isDoorAdapter(adapter)) return;
    let cancelled = false;
    void adapter
      .getChatContext()
      .then((ctx) => {
        if (!cancelled) {
          setContext(ctx);
          onContextChange?.(ctx);
        }
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "mode unavailable"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    void adapter
      .listProjects()
      .then((list) => {
        if (!cancelled) {
          setProjects(list);
          setProjectListError(null);
          if (!list.some((project) => project.status === "ready")) setProjectPending(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProjects([]);
          setProjectListError("Projects unavailable.");
          setProjectPending(false);
        }
      });
    if (typeof adapter.listNotebooks === "function") {
      void adapter
        .listNotebooks()
        .then((list) => {
          if (!cancelled) {
            setNotebooks(list);
            setNotebookListError(null);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setNotebooks([]);
            setNotebookListError("Notebooks unavailable.");
            setNotebookPending(false);
          }
        });
    }
    return () => {
      cancelled = true;
    };
  }, [adapter, attempt, onContextChange]);

  useEffect(() => {
    if (!isDoorAdapter(adapter) || !notebookPending || busy) return;
    const wishlist = defaultNotebook(notebooks);
    if (!wishlist || defaultAttempt === wishlist.id) return;
    setDefaultAttempt(wishlist.id);
    setBusy(true);
    setError(null);
    void adapter
      .selectNotebook(wishlist.id)
      .then(() => adapter.selectChatMode({ mode: "notebook_lm" }))
      .then((selected) => {
        setContext(selected);
        onContextChange?.(selected);
        setNotebookPending(false);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "selection refused"))
      .finally(() => setBusy(false));
  }, [adapter, notebookPending, notebooks, busy, defaultAttempt, onContextChange]);

  if (!isDoorAdapter(adapter)) return null;

  if (!context) {
    const retry = () => {
      setError(null);
      setLoading(true);
      setAttempt((current) => current + 1);
    };
    return (
      <section className="mode-strip" aria-label="Chat mode">
        {loading ? (
          <span role="status" aria-live="polite">Loading chat mode…</span>
        ) : (
          <>
            <span className="mode-strip__error" role="alert">{error ?? "Chat mode unavailable."}</span>
            <button type="button" onClick={retry}>
              Retry chat mode
            </button>
          </>
        )}
      </section>
    );
  }

  const select = async (mode: ChatMode, projectId?: string, personalNamespace?: string) => {
    setBusy(true);
    setError(null);
    try {
      const selected = await adapter.selectChatMode({ mode, projectId, personalNamespace });
      setContext(selected);
      onContextChange?.(selected);
      setProjectPending(false);
      setNotebookPending(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "selection refused");
    } finally {
      setBusy(false);
    }
  };

  const selectNotebookMode = async (notebookId: string) => {
    setBusy(true);
    setError(null);
    try {
      await adapter.selectNotebook(notebookId);
      const selected = await adapter.selectChatMode({ mode: "notebook_lm" });
      setContext(selected);
      onContextChange?.(selected);
      setNotebookPending(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "selection refused");
    } finally {
      setBusy(false);
    }
  };

  const current = CHAT_MODES.find((m) => m.id === context.mode);
  const readyProjects = projects.filter((project) => project.status === "ready");
  const projectAvailable = readyProjects.length > 0 || context.mode === "project";
  const currentNotebookId = context.mode === "notebook_lm" ? notebookIdFromNamespace(context.memory_namespace) : null;
  const modeValue = projectPending ? "project" : notebookPending ? "notebook_lm" : context.mode;

  return (
    <section className="mode-strip" aria-label="Chat mode">
      <label>
        Mode
        <select
          value={modeValue}
          disabled={busy}
          onChange={(e) => {
            const mode = e.target.value as ChatMode;
            if (mode === "project" && context.mode !== "project") {
              setProjectPending(true);
              setNotebookPending(false);
              setError(null);
            } else if (mode === "notebook_lm" && context.mode !== "notebook_lm") {
              setNotebookPending(true);
              setProjectPending(false);
              setError(null);
            } else {
              setProjectPending(false);
              setNotebookPending(false);
              void select(mode);
            }
          }}
        >
          {CHAT_MODES.filter((mode) => mode.id !== "project" || projectAvailable).map((m) => (
            <option key={m.id} value={m.id} title={m.hint}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      {(projectPending || context.mode === "project") && (
        <label>
          Project
          <select
            value={projectPending ? "" : context.project_id ?? ""}
            disabled={busy}
            onChange={(e) => void select("project", e.target.value)}
          >
            <option value="" disabled>Choose a project</option>
            {readyProjects.map((p) => (
              <option key={p.project_id} value={p.project_id}>
                {p.title}
              </option>
            ))}
            {context.mode === "project" && context.project_id && !readyProjects.some((p) => p.project_id === context.project_id) && (
              <option value={context.project_id}>Current project ({context.project_id})</option>
            )}
          </select>
        </label>
      )}
      {(notebookPending || context.mode === "notebook_lm") && (
        <label>
          Notebook
          <select
            value={notebookPending ? "" : currentNotebookId ?? ""}
            disabled={busy}
            onChange={(e) => void selectNotebookMode(e.target.value)}
          >
            <option value="" disabled>
              {notebooks.length === 0 ? "No notebooks available" : "Choose a notebook"}
            </option>
            {notebooks.map((notebook) => (
              <option key={notebook.id} value={notebook.id}>
                {notebook.title || notebook.id}
              </option>
            ))}
            {currentNotebookId && !notebooks.some((notebook) => notebook.id === currentNotebookId) && (
              <option value={currentNotebookId}>Current notebook ({currentNotebookId})</option>
            )}
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
      {projectPending && <span role="status">Choose a project to enter Project mode; {current?.label} remains active.</span>}
      {notebookPending && <span role="status">Choose a notebook to enter NotebookLM mode; {current?.label} remains active.</span>}
      {projectListError && (
        <>
          <span className="mode-strip__error" role="alert">{projectListError}</span>
          <button type="button" onClick={() => setAttempt((current) => current + 1)}>Retry projects</button>
        </>
      )}
      {notebookListError && (
        <>
          <span className="mode-strip__error" role="alert">{notebookListError}</span>
          <button type="button" onClick={() => setAttempt((current) => current + 1)}>Retry notebooks</button>
        </>
      )}
      {error && <span className="mode-strip__error" role="alert">{error}</span>}
    </section>
  );
}
