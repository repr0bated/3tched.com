import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatAdapter } from "./chat-adapter";
import type { DoorChatAdapter } from "./door-chat-adapter";
import { CHAT_MODES, DEFAULT_PERSONAL_NAMESPACE, defaultNotebook, notebookIdFromNamespace, personalSubspace, type ChatMode, type NotebookSummary, type ProjectSummary, type ResolvedChatContext } from "./chat-mode";

const NEW_NAMESPACE = "__new__";
const STORED_NAMESPACES = "3tched.personal-namespaces";

function storedNamespaces(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORED_NAMESPACES) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((name): name is string => typeof name === "string" && personalSubspace(`/personal/${name}`) === name);
  } catch {
    return [];
  }
}

function rememberNamespace(name: string): string[] {
  const next = [...new Set([DEFAULT_PERSONAL_NAMESPACE, ...storedNamespaces(), name])];
  localStorage.setItem(STORED_NAMESPACES, JSON.stringify(next));
  return next;
}

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
  const notebookPendingRef = useRef(false);
  const defaultSelectionInFlightRef = useRef(false);
  const [namespaces, setNamespaces] = useState<string[]>(storedNamespaces);
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const ensuredMain = useRef(false);
  const lastPersonal = useRef(DEFAULT_PERSONAL_NAMESPACE);
  const keepNamespace = useCallback((namespace: string) => {
    const name = personalSubspace(namespace);
    if (!name) return;
    lastPersonal.current = name;
    setNamespaces(rememberNamespace(name));
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  const selectDefaultNotebook = useCallback((list: NotebookSummary[]) => {
    if (!isDoorAdapter(adapter) || !notebookPendingRef.current || defaultSelectionInFlightRef.current) return;
    const wishlist = defaultNotebook(list);
    if (!wishlist) return;
    defaultSelectionInFlightRef.current = true;
    setBusy(true);
    setError(null);
    void adapter
      .selectNotebook(wishlist.id)
      .then(() => adapter.selectChatMode({ mode: "notebook_lm" }))
      .then((selected) => {
        notebookPendingRef.current = false;
        setContext(selected);
        onContextChange?.(selected);
        setNotebookPending(false);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "selection refused"))
      .finally(() => {
        defaultSelectionInFlightRef.current = false;
        setBusy(false);
      });
  }, [adapter, onContextChange]);

  useEffect(() => {
    if (!isDoorAdapter(adapter)) return;
    let cancelled = false;
    void adapter
      .getChatContext()
      .then(async (ctx) => {
        if (cancelled) return;
        if (ctx.mode === "personal" && !personalSubspace(ctx.memory_namespace) && !ensuredMain.current) {
          ensuredMain.current = true;
          try {
            const selected = await adapter.selectChatMode({
              mode: "personal",
              personalNamespace: DEFAULT_PERSONAL_NAMESPACE,
            });
            if (cancelled) return;
            keepNamespace(selected.memory_namespace);
            setContext(selected);
            onContextChange?.(selected);
            return;
          } catch (e) {
            if (!cancelled) setError(e instanceof Error ? e.message : "selection refused");
          }
        }
        if (!cancelled) {
          keepNamespace(ctx.memory_namespace);
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
            selectDefaultNotebook(list);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setNotebooks([]);
            setNotebookListError("Notebooks unavailable.");
            notebookPendingRef.current = false;
            setNotebookPending(false);
          }
        });
    }
    return () => {
      cancelled = true;
    };
  }, [adapter, attempt, keepNamespace, onContextChange, selectDefaultNotebook]);

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
    notebookPendingRef.current = false;
    setBusy(true);
    setError(null);
    try {
      const selected = await adapter.selectChatMode({ mode, projectId, personalNamespace });
      keepNamespace(selected.memory_namespace);
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
    notebookPendingRef.current = false;
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
              notebookPendingRef.current = false;
              setProjectPending(true);
              setNotebookPending(false);
              setError(null);
            } else if (mode === "notebook_lm" && context.mode !== "notebook_lm") {
              notebookPendingRef.current = true;
              setNotebookPending(true);
              setProjectPending(false);
              setError(null);
              selectDefaultNotebook(notebooks);
            } else {
              notebookPendingRef.current = false;
              setProjectPending(false);
              setNotebookPending(false);
              void select(
                mode,
                undefined,
                mode === "personal" ? lastPersonal.current : undefined,
              );
            }
          }}
        >
          {CHAT_MODES.map((m) => (
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
        <label>
          Namespace
          <select
            aria-label="Namespace"
            value={personalSubspace(context.memory_namespace) || DEFAULT_PERSONAL_NAMESPACE}
            disabled={busy}
            onChange={(e) => {
              const value = e.target.value;
              if (value === NEW_NAMESPACE) {
                setDraft("");
                setNameError(null);
                setNaming(true);
                return;
              }
              void select("personal", undefined, value);
            }}
          >
            {[...new Set([DEFAULT_PERSONAL_NAMESPACE, ...namespaces, personalSubspace(context.memory_namespace)].filter(Boolean))].map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
            <option value={NEW_NAMESPACE}>New…</option>
          </select>
        </label>
      )}
      {naming && (
        <form
          className="namespace-prompt"
          role="dialog"
          aria-modal="true"
          aria-label="New namespace"
          onSubmit={(e) => {
            e.preventDefault();
            const name = draft.trim();
            if (personalSubspace(`/personal/${name}`) !== name) {
              setNameError("Use 1 to 64 characters: a-z, 0-9, _ or -.");
              return;
            }
            setNamespaces(rememberNamespace(name));
            setNaming(false);
            void select("personal", undefined, name);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setNaming(false);
          }}
        >
          <p className="namespace-prompt__title">Name this namespace</p>
          <label>
            Name
            <input
              autoFocus
              value={draft}
              disabled={busy}
              onChange={(e) => setDraft(e.target.value)}
            />
          </label>
          {nameError && <span className="mode-strip__error" role="alert">{nameError}</span>}
          <div className="namespace-prompt__actions">
            <button type="submit" disabled={busy || !draft.trim()}>Add</button>
            <button type="button" onClick={() => setNaming(false)} disabled={busy}>Cancel</button>
          </div>
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
