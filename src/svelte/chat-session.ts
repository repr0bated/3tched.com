import type { Spec } from "@json-render/core";
import type {
  ChatAdapter,
  ChatMessage,
  RouteSelection,
} from "../chat/chat-adapter";
import type { ResolvedChatContext } from "../chat/chat-mode";
import { notebookIdFromNamespace } from "../chat/chat-mode";
import type { DoorChatAdapter } from "../chat/door-chat-adapter";
import { registerScratchCatalogObject } from "../json-render/references/chat-scratch";

export interface ChatRuntime {
  adapter: ChatAdapter;
  scopeKey: string;
  context: ResolvedChatContext | null;
  route: RouteSelection;
  modelLabel: string;
  layout?: "balanced" | "conversation" | "canvas";
  setCanvas: (spec: Spec) => void;
}

export interface ThreadMessage extends ChatMessage {
  canvasSpec?: Spec;
  prompt?: string;
  saved?: boolean;
  saving?: boolean;
}

export interface Thread {
  messages: ThreadMessage[];
  draft: string;
  sending: boolean;
  error: string | null;
  saveStatus: string | null;
}

const emptyThread = (): Thread => ({
  messages: [],
  draft: "",
  sending: false,
  error: null,
  saveStatus: null,
});
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The request could not be completed.";

/** Framework-neutral state; late replies always belong to their originating scope. */
export class ChatSession {
  private runtime: ChatRuntime | null = null;
  private threads = new Map<string, Thread>();
  private listeners = new Set<() => void>();
  private sequence = 0;
  private disposed = false;

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  configure(runtime: ChatRuntime) {
    if (this.runtime && this.runtime.adapter !== runtime.adapter)
      this.threads.clear();
    this.runtime = runtime;
    if (!this.threads.has(runtime.scopeKey))
      this.threads.set(runtime.scopeKey, emptyThread());
    this.notify();
  }

  get current(): Thread {
    return this.threads.get(this.runtime?.scopeKey ?? "") ?? emptyThread();
  }

  private notify() {
    for (const listener of this.listeners) listener();
  }

  private update(key: string, patch: Partial<Thread>) {
    const thread = this.threads.get(key);
    if (this.disposed || !thread) return;
    this.threads.set(key, { ...thread, ...patch });
    this.notify();
  }

  setDraft(draft: string) {
    if (this.runtime) this.update(this.runtime.scopeKey, { draft });
  }

  clear() {
    if (!this.runtime || this.current.sending) return;
    this.threads.set(this.runtime.scopeKey, emptyThread());
    this.notify();
  }

  async submit(text = this.current.draft) {
    const runtime = this.runtime;
    const message = text.trim();
    if (
      !runtime ||
      !message ||
      this.current.sending ||
      (runtime.adapter.kind === "remote" && !runtime.context)
    )
      return;
    const { adapter, scopeKey, context, route } = runtime;
    const history: ChatMessage[] = [
      ...this.current.messages.map(({ id, role, content }) => ({
        id,
        role,
        content,
      })),
      { id: `svelte-user-${++this.sequence}`, role: "user", content: message },
    ];
    this.update(scopeKey, {
      messages: [...this.current.messages, history[history.length - 1]],
      draft: "",
      sending: true,
      error: null,
    });
    const stillOwned = () =>
      !this.disposed && this.runtime?.adapter === adapter;
    try {
      const remote =
        adapter.kind === "remote" ? (adapter as DoorChatAdapter) : null;
      const notebookId =
        context?.mode === "notebook_lm"
          ? notebookIdFromNamespace(context.memory_namespace)
          : null;
      const notebook =
        notebookId && remote?.getNotebook
          ? await remote.getNotebook(notebookId).catch(() => null)
          : undefined;
      const catalog =
        remote?.gallery && context && context.mode !== "ui_render"
          ? await remote.gallery.activeCatalog().catch(() => [])
          : undefined;
      if (!stillOwned()) return;
      const response = await adapter.submit({
        message,
        history,
        route,
        mode: context?.mode,
        notebook,
        catalog,
      });
      if (!stillOwned()) return;
      const reply = {
        ...response.message,
        id: `svelte-reply-${++this.sequence}`,
        canvasSpec: response.canvasSpec,
        prompt: message,
      };
      this.update(scopeKey, {
        messages: [...this.threads.get(scopeKey)!.messages, reply],
      });
      if (response.canvasSpec) {
        if (response.scratch)
          registerScratchCatalogObject(scopeKey, response.canvasSpec);
        runtime.setCanvas(response.canvasSpec);
        if (context?.mode === "ui_render") await this.save(reply.id, runtime);
      }
    } catch (error) {
      if (stillOwned())
        this.update(scopeKey, {
          error: errorMessage(error),
          draft: this.threads.get(scopeKey)?.draft || message,
        });
    } finally {
      if (stillOwned()) this.update(scopeKey, { sending: false });
    }
  }

  async save(id: string, runtime = this.runtime) {
    if (!runtime || runtime.adapter.kind !== "remote" || !runtime.context)
      return;
    const gallery = (runtime.adapter as DoorChatAdapter).gallery;
    const message = this.threads
      .get(runtime.scopeKey)
      ?.messages.find((item) => item.id === id);
    if (!gallery || !message?.canvasSpec || message.saved || message.saving)
      return;
    const updateMessage = (
      patch: Partial<ThreadMessage>,
      saveStatus?: string,
    ) => {
      const thread = this.threads.get(runtime.scopeKey);
      if (
        this.disposed ||
        this.runtime?.adapter !== runtime.adapter ||
        !thread?.messages.some((item) => item.id === id)
      )
        return;
      this.update(runtime.scopeKey, {
        messages: thread.messages.map((item) =>
          item.id === id ? { ...item, ...patch } : item,
        ),
        ...(saveStatus ? { saveStatus } : {}),
      });
    };
    updateMessage({ saving: true });
    try {
      await gallery.saveCandidate({
        spec: message.canvasSpec,
        title: message.prompt ?? "Chat result",
        prompt: message.prompt,
        mode: runtime.context.mode,
      });
      updateMessage({ saved: true, saving: false }, "Saved to candidates.");
    } catch (error) {
      updateMessage(
        { saving: false },
        `Could not save: ${errorMessage(error)}`,
      );
    }
  }

  dispose() {
    this.disposed = true;
    this.listeners.clear();
    this.threads.clear();
  }
}
