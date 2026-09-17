import {
  Children,
  Component,
  isValidElement,
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
import { setByPath } from "@json-render/core";
import { useChatRuntime } from "../../chat/ChatRuntimeProvider";
import type { ChatMessage } from "../../chat/chat-adapter";
import { chatCatalog } from "./chat-catalog";

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

    tchedRouterPicker: function TchedRouterPicker({ props }) {
      const {
        adapter,
        providers,
        route,
        routeError,
        routePending,
        selectModel,
        selectProvider,
      } = useChatRuntime();
      const remote = adapter.kind === "remote";
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
              value={route.modelId}
              onChange={(event) => void selectModel(event.target.value)}
              disabled={routePending}
            >
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
      const [input, setInput] = useState("");
      const [sending, setSending] = useState(false);
      const [error, setError] = useState<string | null>(null);
      const { adapter, canvasSpec, route, setCanvasSpec } = useChatRuntime();
      const remote = adapter.kind === "remote";
      const { get, set } = useStateStore();
      const messagesPath = `/streams/${props.streamId}/messages`;
      const messageValue = useStateValue(messagesPath);
      const messages = toMessages(messageValue);

      const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const message = input.trim();
        if (!message || sending) return;

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
          const response = await adapter.submit({ message, history, route });
          set(messagesPath, [
            ...toMessages(get(messagesPath)),
            response.message,
          ]);
          if (response.canvasSpec) setCanvasSpec(response.canvasSpec);
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
            <div className="thread-viewport">
              {messages.length === 0 ? (
                <div className="thread-empty">
                  <strong>{remote ? "Start the conversation." : "Start with an interface brief."}</strong>
                  <p>
                    {remote
                      ? "Each turn is one authenticated Chat call on tched_router through the door; the reply lands in the state-backed thread."
                      : "Try “Build an incident triage board.” The local adapter will answer in the state-backed thread and repack the Canvas below."}
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
                disabled={sending}
                autoComplete="off"
              />
              <button type="submit" disabled={sending || !input.trim()}>
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
                  <button type="button" className="workspace-tab workspace-tab--active" aria-current="page">
                    Canvas
                  </button>
                  <button type="button" className="workspace-tab" disabled>
                    Spec trace
                  </button>
                </nav>
                <div className="canvas-state">
                  <span aria-hidden="true" />
                  draggable local spec
                </div>
              </div>
              <div className="canvas-frame">
                <div className="canvas-intro">
                  <div>
                    <p className="eyebrow">SCHEMA-RENDERED CANVAS</p>
                    <h2>Golden workbench</h2>
                  </div>
                  <p>
                    Drag tiles to reorder and repack. A real adapter can replace
                    this supported local sample with generated UI.
                  </p>
                </div>
                <CanvasBoundary key={JSON.stringify(canvasSpec)}>
                  <Renderer spec={canvasSpec} registry={chatRegistry} />
                </CanvasBoundary>
              </div>
              <footer className="developer-status">
                <span>@json-render/core + react</span>
                <span>full catalog copied / ChatOnly registry active</span>
              </footer>
            </section>
          ) : null}
        </div>
      );
    },

    chatMessage: ({ props }) => (
      <article className={`message message--${props.role}`}>
        <p className="message__role">
          {props.role === "agent" ? "assistant" : props.role}
        </p>
        <p>{props.content}</p>
      </article>
    ),

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
