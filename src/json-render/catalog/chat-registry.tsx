import { dashboardComponents } from "./dashboard-components";
import {
  Children,
  Component,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Renderer, defineRegistry, useStateStore, useStateValue } from "@json-render/react";
import { setByPath, type Spec } from "@json-render/core";
import { chatMessagesPath, useChatRuntime } from "../../chat/ChatRuntimeProvider";
import type { ChatMessage } from "../../chat/chat-adapter";
import { notebookIdFromNamespace, type ChatMode } from "../../chat/chat-mode";
import { ModeStrip } from "../../chat/ModeStrip";
import { GalleryPanel } from "../../chat/GalleryPanel";
import { useSudoPrompt } from "../../chat/SudoPrompt";
import type { DoorChatAdapter } from "../../chat/door-chat-adapter";
import { chatCatalog } from "./chat-catalog";
import { registerScratchCatalogObject } from "../references/chat-scratch";
import { notebookCanvasSpec } from "../references/canvas-contract";

const ARROW: Record<string, string> = {
  up: "↑",
  down: "↓",
  flat: "→",
};

let userMessageSequence = 0;

function nextUserMessageId(): string {
  userMessageSequence += 1;
  return `local-user-${userMessageSequence}`;
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ChatMessage>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.content === "string" &&
    (candidate.role === "user" ||
      candidate.role === "agent" ||
      candidate.role === "system")
  );
}

function toMessages(value: unknown): ChatMessage[] {
  return Array.isArray(value) ? value.filter(isChatMessage) : [];
}

function ChatMessageView({ message }: { message: ChatMessage }) {
  return <article className={`message message--${message.role}`}>
    <p className="message__role">{message.role === "agent" ? "assistant" : message.role}</p>
    <p>{message.content}</p>
  </article>;
}

const TILE_PATTERN = ["hero", "wide", "compact", "tall", "wide", "compact"] as const;

interface SortableTileProps {
  id: string;
  index: number;
  disabled: boolean;
  children: ReactNode;
}

function SortableTile({ id, index, disabled, children }: SortableTileProps) {
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  } satisfies CSSProperties;

  return (
    <article
      ref={setNodeRef}
      className="sortable-tile"
      data-layout={TILE_PATTERN[index % TILE_PATTERN.length]}
      data-dragging={isDragging ? "true" : "false"}
      style={style}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        className="drag-handle"
        aria-label={`Reorder Canvas tile ${index + 1}`}
        title="Drag to reorder. Press Space, then arrow keys, for keyboard control."
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <span aria-hidden="true" className="drag-grip" />
      </button>
      {children}
    </article>
  );
}

class CanvasBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="canvas-error" role="alert">
          <strong>Canvas spec could not render.</strong>
          <span>{this.state.error}</span>
        </div>
      );
    }
    return this.props.children;
  }
}

const registryDefinition = defineRegistry(chatCatalog, {
  actions: {
    setState: async (params, setState) => {
      if (!params?.statePath) {
        throw new Error("setState requires a JSON Pointer statePath.");
      }
      const segments = params.statePath.slice(1).split("/");
      if (
        !params.statePath.startsWith("/") ||
        segments.some((segment) =>
          ["__proto__", "prototype", "constructor"].includes(
            segment.replaceAll("~1", "/").replaceAll("~0", "~"),
          ),
        )
      ) {
        throw new Error("setState received an unsafe JSON Pointer.");
      }
      setState((previous) => {
        const next = structuredClone(previous);
        setByPath(next, params.statePath, params.value);
        return next;
      });
    },
  },
  components: {
    ...dashboardComponents,
    container: ({ props, children }) => (
      <div className={props.className ?? "catalog-stack"}>{children}</div>
    ),

    pageHeader: function PageHeader({ props }) {
      const { adapter } = useChatRuntime();
      const remote = adapter.kind === "remote";
      return (
        <header className="page-heading">
          <div className="page-heading__signal" aria-hidden="true" />
          <div>
            <p className="eyebrow">{remote ? "3TCHED / DOOR :8090" : "3TCHED / LOCAL WORKBENCH"}</p>
            <h1>{props.title}</h1>
            {props.subtitle ? <p className="page-subtitle">{props.subtitle}</p> : null}
          </div>
          <div className="runtime-pill" aria-label={remote ? "Connected to the door" : "Local adapter online"}>
            <span aria-hidden="true" />
            {remote ? "door" : "local"}
          </div>
        </header>
      );
    },

    chatModeSelector: function ChatModeSelector() {
      const { adapter, setChatContext } = useChatRuntime();
      return <ModeStrip adapter={adapter} onContextChange={setChatContext} />;
    },

    tchedRouterPicker: function TchedRouterPicker({ props }) {
      const {
        adapter,
        chatContext,
        providers,
        route,
        routeError,
        routePending,
        selectModel,
        selectProvider,
      } = useChatRuntime();
      const remote = adapter.kind === "remote";
      if (remote && !chatContext) return null;

      // Fallback when no providers available
      if (providers.length === 0) {
        return (
          <section className={`routing-strip ${props.className ?? ""}`} aria-label="Router unavailable">
            <div className="routing-strip__label">
              <span>ROUTE</span>
              <small>{remote ? "keyed by provider" : "local demo only"}</small>
            </div>
            <p className="route-status route-status--error">
              No provider is configured.
            </p>
          </section>
        );
      }

      const models =
        providers.find((provider) => provider.id === route.providerId)?.models ?? [];

      return (
        <section
          className={`routing-strip ${props.className ?? ""}`}
          aria-label={remote ? "Router model selection" : "Local model routing"}
        >
          <div className="routing-strip__label">
            <span>ROUTE</span>
            <small>{remote ? "tched_router via :8090" : "local demo only"}</small>
          </div>
          <label>
            <span>Provider</span>
            <select
              value={route.providerId}
              onChange={(event) => void selectProvider(event.target.value)}
              disabled={routePending}
            >
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                </option>
              ))}
            </select>
          </label>
          <label className="model-select">
            <span>Model</span>
            <select
              value={models.length === 0 ? "" : route.modelId}
              onChange={(event) => void selectModel(event.target.value)}
              disabled={routePending || models.length === 0}
            >
              {models.length === 0 ? <option value="">No models for this provider yet</option> : null}
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
          </label>
          <p className={routeError ? "route-status route-status--error" : "route-status"} role="status">
            {routeError ??
              (routePending
                ? remote
                  ? "committing selection to the router"
                  : "switching local route"
                : remote
                  ? "selection is committed server-side"
                  : "no network calls")}
          </p>
        </section>
      );
    },

    antigravityChatContainer: function AntigravityChatContainer({ props, children }) {
      const [inputs, setInputs] = useState<Map<string, string>>(() => new Map());
      const [sendingScopes, setSendingScopes] = useState<Set<string>>(() => new Set());
      const [errors, setErrors] = useState<Map<string, string>>(() => new Map());
      const { adapter, canvasSpec, chatContext, route, scopeKey, setCanvasSpec } = useChatRuntime();
      const remote = adapter.kind === "remote";
      const { get, set } = useStateStore();
      const messagesPath = chatMessagesPath(props.streamId, scopeKey);
      const input = inputs.get(scopeKey) ?? "";
      const sending = sendingScopes.has(scopeKey);
      const error = errors.get(scopeKey) ?? null;
      const setInput = (value: string) => setInputs(previous => new Map(previous).set(scopeKey, value));
      const setSending = (value: boolean) => setSendingScopes(previous => {
        const next = new Set(previous);
        if (value) next.add(scopeKey);
        else next.delete(scopeKey);
        return next;
      });
      const setError = (value: string | null) => setErrors(previous => {
        const next = new Map(previous);
        if (value) next.set(scopeKey, value);
        else next.delete(scopeKey);
        return next;
      });
      const messageValue = useStateValue(messagesPath);
      const messages = toMessages(messageValue);
      const gallery = remote ? (adapter as DoorChatAdapter).gallery ?? null : null;
      const [elevate, sudoPrompt] = useSudoPrompt(remote ? (adapter as DoorChatAdapter).authorizeTask : undefined);
      const [view, setView] = useState<"canvas" | "candidates" | "catalog">("canvas");
      const [galleryRefresh, setGalleryRefresh] = useState(0);
      const [lastCanvas, setLastCanvas] = useState<{ spec: Spec; prompt: string; mode: ChatMode; saved: boolean } | null>(null);
      const [saveStatus, setSaveStatus] = useState<string | null>(null);
      const keepCanvas = async (kept: { spec: Spec; prompt: string; mode: ChatMode }) => {
        if (!gallery) return;
        try {
          await gallery.saveCandidate({ spec: kept.spec, title: kept.prompt, mode: kept.mode, prompt: kept.prompt });
          setLastCanvas((current) => (current?.spec === kept.spec ? { ...current, saved: true } : current));
          setSaveStatus("Saved to candidates.");
          setGalleryRefresh((value) => value + 1);
        } catch (cause) {
          setSaveStatus(cause instanceof Error ? cause.message : "The canvas was not saved.");
        }
      };
      const notebookId = chatContext?.mode === "notebook_lm"
        ? notebookIdFromNamespace(chatContext.memory_namespace)
        : null;
      const setCanvasSpecRef = useRef(setCanvasSpec);
      setCanvasSpecRef.current = setCanvasSpec;
      useEffect(() => {
        if (!notebookId || typeof (adapter as DoorChatAdapter).getNotebook !== "function") return;
        let cancelled = false;
        void (adapter as DoorChatAdapter).getNotebook(notebookId)
          .then((detail) => {
            if (!cancelled) setCanvasSpecRef.current(notebookCanvasSpec(detail));
          })
          .catch(() => undefined);
        return () => {
          cancelled = true;
        };
      }, [adapter, notebookId]);

      // Keep the newest message in view as the thread grows.
      const threadRef = useRef<HTMLDivElement>(null);
      useEffect(() => {
        const viewport = threadRef.current;
        if (viewport) viewport.scrollTop = viewport.scrollHeight;
      }, [messages.length, sending]);

      const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const message = input.trim();
        if (!message || sending || (remote && !chatContext)) return;

        const userMessage: ChatMessage = {
          id: nextUserMessageId(),
          role: "user",
          content: message,
        };
        const history = [...toMessages(get(messagesPath)), userMessage];
        set(messagesPath, history);
        setInput("");
        setError(null);
        setSending(true);

        try {
          const notebookId = chatContext?.mode === "notebook_lm"
            ? notebookIdFromNamespace(chatContext.memory_namespace)
            : null;
          const notebook = notebookId && typeof (adapter as DoorChatAdapter).getNotebook === "function"
            ? await (adapter as DoorChatAdapter).getNotebook(notebookId).catch(() => null)
            : undefined;
          const mode = chatContext?.mode;
          // Normal modes compose from the active catalog; UI render proposes.
          const catalog = gallery && mode && mode !== "ui_render"
            ? await gallery.activeCatalog().catch(() => [])
            : undefined;
          const response = await adapter.submit({ message, history, route, mode, notebook, catalog });
          set(messagesPath, [
            ...toMessages(get(messagesPath)),
            response.message,
          ]);
          if (response.canvasSpec) {
            if (response.scratch) registerScratchCatalogObject(scopeKey, response.canvasSpec);
            setCanvasSpec(response.canvasSpec);
            setView("canvas");
            setSaveStatus(null);
            if (mode) {
              const kept = { spec: response.canvasSpec, prompt: message, mode };
              setLastCanvas({ ...kept, saved: false });
              // UI render keeps every canvas it draws as a candidate.
              if (mode === "ui_render") void keepCanvas(kept);
            }
          }
        } catch (submitError) {
          setError(
            submitError instanceof Error
              ? submitError.message
              : remote
                ? "The door could not complete the request."
                : "The local adapter could not complete the request.",
          );
        } finally {
          setSending(false);
        }
      };

      return (
        <div className="workbench">
          <section className="chat-panel" aria-label="Conversation">
            <div className="panel-label-row">
              <span>LIVE THREAD</span>
              <span>{messages.length.toString().padStart(2, "0")} MESSAGES</span>
            </div>
            <div className="thread-viewport" ref={threadRef}>
              {messages.length === 0 ? (
                <div className="thread-empty">
                  <strong>{remote ? "Start the conversation." : "Start with an interface brief."}</strong>
                  <p>
                    {remote
                      ? "Chat uses your authenticated connection. Use /ui-reference to browse static interface examples."
                      : "Try /ui-reference story for the 3tched walkthrough, /ui-reference btrfs for a dashboard example, or describe an interface."}
                  </p>
                </div>
              ) : null}
              {children}
            </div>
            {error ? <p className="chat-error" role="alert">{error}</p> : null}
            <form className="composer" onSubmit={handleSubmit}>
              <label htmlFor="chat-message-input">Message</label>
              <input
                id="chat-message-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={props.placeholder ?? "Send a message"}
                disabled={sending || (remote && !chatContext)}
                autoComplete="off"
              />
              <button type="submit" disabled={sending || !input.trim() || (remote && !chatContext)}>
                {sending ? "Sending" : "Send"}
              </button>
            </form>
            <p className="sr-only" aria-live="polite" aria-atomic="true">
              {sending
                ? remote
                  ? "Waiting for the router to respond."
                  : "Local adapter is composing a response."
                : error ?? "Ready."}
            </p>
          </section>

          {props.workspace !== false ? (
            <section className="workspace" aria-label="Canvas workspace">
              <div className="workspace-rule" aria-hidden="true">
                <span>MODEL WORKBENCH</span>
              </div>
              <div className="workspace-controls">
                <nav aria-label="Workspace views">
                  {([
                    ["canvas", "Canvas"],
                    ...(gallery ? [["candidates", "Candidates"], ["catalog", "Catalog"]] as const : []),
                  ] as const).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className={`workspace-tab ${view === id ? "workspace-tab--active" : ""}`}
                      aria-current={view === id ? "page" : undefined}
                      onClick={() => setView(id)}
                    >
                      {label}
                    </button>
                  ))}
                </nav>
                {gallery && view === "canvas" && lastCanvas && !lastCanvas.saved ? (
                  <button type="button" className="workspace-save" onClick={() => void keepCanvas(lastCanvas)}>
                    Save to gallery
                  </button>
                ) : null}
                <div className="canvas-state">
                  <span aria-hidden="true" />
                  catalog-validated canvas
                </div>
              </div>
              <div className="canvas-frame">
                <div className="canvas-intro">
                  <div>
                    <p className="eyebrow">SCHEMA-RENDERED CANVAS</p>
                    <h2>Interface canvas</h2>
                  </div>
                  <p>
                    Ask in any mode for a useful visual. Use UI render to explore
                    candidate interface designs, or open /ui-reference examples.
                  </p>
                </div>
                {gallery && view !== "canvas" ? (
                  <GalleryPanel
                    gallery={gallery}
                    view={view}
                    refreshKey={galleryRefresh}
                    elevate={elevate}
                    onShow={(spec) => {
                      setCanvasSpec(spec);
                      setView("canvas");
                    }}
                  />
                ) : (
                  <CanvasBoundary key={JSON.stringify(canvasSpec)}>
                    <Renderer spec={canvasSpec} registry={chatRegistry} />
                  </CanvasBoundary>
                )}
                {sudoPrompt}
                <p className="sr-only" role="status" aria-live="polite">{saveStatus ?? ""}</p>
              </div>
              <footer className="developer-status">
                <span>Validated component catalog</span>
                <span>Canvas follows the selected conversation scope</span>
              </footer>
            </section>
          ) : null}
        </div>
      );
    },

    chatMessage: ({ props }) => <ChatMessageView message={{ id: "static", ...props }} />,

    chatThread: function ChatThread({ props }) {
      const { scopeKey } = useChatRuntime();
      const messages = toMessages(useStateValue(chatMessagesPath(props.streamId, scopeKey)));
      return <div className="message-thread">{messages.map(message =>
        <ChatMessageView key={message.id} message={message} />
      )}</div>;
    },

    autoTile: function AutoTile({ props, children }) {
      const childNodes = Children.toArray(children);
      const childMap = new Map(
        childNodes.map((child, index) => [
          isValidElement(child) ? String(child.key ?? `tile-${index}`) : `tile-${index}`,
          child,
        ]),
      );
      const ids = [...childMap.keys()];
      const [savedOrder, setSavedOrder] = useState<string[]>([]);
      const [activeId, setActiveId] = useState<string | null>(null);
      const [boardStatus, setBoardStatus] = useState("Board ready for reordering.");
      const order = [
        ...savedOrder.filter((id) => childMap.has(id)),
        ...ids.filter((id) => !savedOrder.includes(id)),
      ];
      const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
      );

      const handleDragStart = (event: DragStartEvent) => {
        setActiveId(String(event.active.id));
        setBoardStatus("Tile lifted. Move it to a new position, then drop.");
      };

      const handleDragEnd = (event: DragEndEvent) => {
        setActiveId(null);
        if (!event.over || event.active.id === event.over.id) {
          setBoardStatus("Tile returned to its current position.");
          return;
        }
        const from = order.indexOf(String(event.active.id));
        const to = order.indexOf(String(event.over.id));
        if (from >= 0 && to >= 0) {
          setSavedOrder(arrayMove(order, from, to));
          setBoardStatus(`Tile placed in position ${to + 1}. Board repacked.`);
        }
      };

      const boardStyle = {
        "--tile-gap": `${props.gap ?? 8}px`,
      } as CSSProperties;

      return (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragCancel={() => {
            setActiveId(null);
            setBoardStatus("Reordering cancelled.");
          }}
          onDragEnd={handleDragEnd}
        >
          <div className="auto-tile-shell">
            <div className="board-toolbar">
              <span aria-hidden="true">PHI GRID / 12C</span>
              <button
                type="button"
                onClick={() => {
                  setSavedOrder([]);
                  setBoardStatus("Original tile order restored.");
                }}
                disabled={savedOrder.length === 0}
              >
                Reset layout
              </button>
              <span className="sr-only" aria-live="polite">{boardStatus}</span>
            </div>
            <SortableContext items={order} strategy={rectSortingStrategy}>
              <div
                className={`auto-tile-board ${props.className ?? ""}`}
                data-active={activeId ? "true" : "false"}
                data-board-id={props.boardId ?? "canvas"}
                style={boardStyle}
              >
                {order.map((id, index) => (
                  <SortableTile
                    key={id}
                    id={id}
                    index={index}
                    disabled={props.reorderable === false}
                  >
                    {childMap.get(id)}
                  </SortableTile>
                ))}
              </div>
            </SortableContext>
          </div>
        </DndContext>
      );
    },

    autoTileItem: ({ props, children }) => (
      <div
        className={`auto-tile-content ${props.className ?? ""}`}
        data-tile-id={props.tileId ?? undefined}
        data-size={props.size ?? "medium"}
      >
        {children}
      </div>
    ),

    heading: ({ props }) => {
      if (props.level === 1) return <h3 className="canvas-heading canvas-heading--large">{props.text}</h3>;
      if (props.level === 3) return <h4 className="canvas-heading canvas-heading--small">{props.text}</h4>;
      return <h3 className="canvas-heading">{props.text}</h3>;
    },

    text: ({ props }) => (
      <p className={`canvas-copy ${props.className ?? ""}`}>{props.text}</p>
    ),

    badge: ({ props }) => (
      <span className={`canvas-badge canvas-badge--${props.tone ?? "default"}`}>
        {props.text ?? props.label}
      </span>
    ),

    row: ({ props, children }) => (
      <div className={`canvas-row ${props.className ?? ""}`}>{children}</div>
    ),

    stat: ({ props }) => (
      <div className="canvas-stat">
        <span>{props.label}</span>
        <strong>{props.value}</strong>
        <small>
          {props.trend ? ARROW[props.trend] : null}
          {props.unit ? ` ${props.unit}` : null}
        </small>
      </div>
    ),
  },
});

export const chatRegistry = registryDefinition.registry;
