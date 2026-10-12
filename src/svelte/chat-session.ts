import type { Spec } from "@json-render/core";
import type {
  ChatAdapter,
  ChatMessage,
  RouteSelection,
} from "../chat/chat-adapter";
import type { ResolvedChatContext } from "../chat/chat-mode";
import { notebookIdFromNamespace } from "../chat/chat-mode";
import type { DoorChatAdapter } from "../chat/door-chat-adapter";
import { registerScratchCatalogObject, removeScratchCatalogObject } from "../json-render/references/chat-scratch";
import { validateCanvasSpec } from "../json-render/references/canvas-contract";
import { adoptPromotedEntries, registeredComponent } from "../json-render/references/registered-components";

export interface ChatRuntime {
  adapter: ChatAdapter;
  scopeKey: string;
  context: ResolvedChatContext | null;
  route: RouteSelection;
  modelLabel: string;
  layout?: "balanced" | "conversation" | "canvas";
  setCanvas: (spec: Spec) => void;
  clearCanvas?: () => void;
}

export interface ThreadMessage extends ChatMessage {
  /** Pending and failed turns stay visible without becoming provider conversation. */
  historyEligible?: boolean;
  canvasSpec?: Spec;
  canvasSpecs?: Spec[];
  savedCanvases?: number[];
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

export interface RenderedView {
  spec: Spec;
  note?: string;
  candidateId?: string;
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
const dispatchContextKey = (runtime: ChatRuntime) =>
  JSON.stringify([runtime.scopeKey, runtime.context, runtime.route]);

/** Framework-neutral state; late replies always belong to their originating scope. */
export class ChatSession {
  private runtime: ChatRuntime | null = null;
  private threads = new Map<string, Thread>();
  private listeners = new Set<() => void>();
  private sequence = 0;
  private disposed = false;
  private dispatchGeneration = 0;
  private dispatchKey: string | null = null;

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  configure(runtime: ChatRuntime) {
    const nextKey = dispatchContextKey(runtime);
    if (this.runtime?.adapter !== runtime.adapter || this.dispatchKey !== nextKey)
      this.dispatchGeneration++;
    this.dispatchKey = nextKey;
    if (this.runtime && this.runtime.adapter !== runtime.adapter) {
      for (const scope of this.threads.keys()) removeScratchCatalogObject(scope);
      this.threads.clear();
    }
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
    removeScratchCatalogObject(this.runtime.scopeKey);
    this.runtime.clearCanvas?.();
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
    const { adapter, scopeKey, context } = runtime;
    const route = { ...runtime.route };
    const dispatchGeneration = this.dispatchGeneration;
    const dispatchKey = dispatchContextKey(runtime);
    const user: ThreadMessage = {
      id: `svelte-user-${++this.sequence}`,
      role: "user",
      content: message,
      historyEligible: false,
    };
    const history: ChatMessage[] = [
      ...this.current.messages
        .filter((item) => item.historyEligible !== false)
        .map(({ id, role, content }) => ({ id, role, content })),
      { id: user.id, role: user.role, content: user.content },
    ];
    this.update(scopeKey, {
      messages: [...this.current.messages, user],
      draft: "",
      sending: true,
      error: null,
    });
    const stillOwned = () =>
      !this.disposed && this.runtime?.adapter === adapter;
    const readyToDispatch = () => {
      if (!stillOwned()) return false;
      if (
        this.dispatchGeneration !== dispatchGeneration ||
        dispatchContextKey(this.runtime!) !== dispatchKey
      )
        throw new Error("Chat context or model changed before dispatch. Send again from the intended chat.");
      return true;
    };
    let responseCompleted = false;
    try {
      if (!readyToDispatch()) return;
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
      if (!readyToDispatch()) return;
      const catalog =
        remote?.gallery && context && context.mode !== "personal" && context.mode !== "ui_render"
          ? await remote.gallery.activeCatalog().catch(() => [])
          : undefined;
      if (catalog?.length) adoptPromotedEntries(catalog, validateCanvasSpec);
      if (!readyToDispatch()) return;
      const response = await adapter.submit({
        message,
        history,
        route,
        mode: context?.mode,
        notebook,
        catalog,
      });
      if (!stillOwned()) return;
      await this.keepRegistered(response.registered);
      responseCompleted = response.historyEligible !== false;
      const reply = {
        ...response.message,
        id: `svelte-reply-${++this.sequence}`,
        canvasSpec: response.canvasSpec,
        canvasSpecs: response.canvasSpecs,
        prompt: message,
        historyEligible: responseCompleted,
      };
      // Commit the exchange before presentation: a canvas failure cannot undo a model reply.
      this.update(scopeKey, {
        messages: [
          ...this.threads.get(scopeKey)!.messages.map((item) =>
            item.id === user.id ? { ...item, historyEligible: responseCompleted } : item,
          ),
          reply,
        ],
        ...(!responseCompleted
          ? { draft: this.threads.get(scopeKey)!.draft || message }
          : {}),
      });
      const canvases = response.canvasSpecs ?? (response.canvasSpec ? [response.canvasSpec] : []);
      for (const spec of canvases) registerScratchCatalogObject(scopeKey, spec);
      if (canvases.length) {
        runtime.setCanvas(canvases[canvases.length - 1]);
        if (context?.mode === "ui_render") {
          for (let index = 0; index < canvases.length && stillOwned(); index++) {
            await this.save(reply.id, runtime, index);
            if (!this.threads.get(scopeKey)?.messages.find(item => item.id === reply.id)?.savedCanvases?.includes(index)) break;
          }
        }
      }
    } catch (error) {
      if (stillOwned())
        this.update(scopeKey, {
          error: errorMessage(error),
          ...(!responseCompleted
            ? { draft: this.threads.get(scopeKey)?.draft || message }
            : {}),
        });
    } finally {
      if (stillOwned()) this.update(scopeKey, { sending: false });
    }
  }

  /** Load compositions promoted from the UI renderer into the catalog the next page uses. */
  async prepareCatalog(): Promise<void> {
    const remote = this.runtime?.adapter.kind === "remote" ? (this.runtime.adapter as DoorChatAdapter) : null;
    if (!remote?.gallery) return;
    const entries = await remote.gallery.activeCatalog().catch(() => []);
    if (entries.length) adoptPromotedEntries(entries, validateCanvasSpec);
  }

  /** A route's view: the same door request as a chat turn, but nothing enters the transcript. */
  async generateView(prompt: string, title: string): Promise<RenderedView> {
    const runtime = this.runtime;
    if (!runtime) throw new Error("Chat is not ready yet.");
    if (runtime.adapter.kind === "remote" && !runtime.context) throw new Error("Waiting for the chat session…");
    const generation = this.dispatchGeneration;
    const requireCurrent = () => {
      if (this.disposed || this.runtime?.adapter !== runtime.adapter || generation !== this.dispatchGeneration)
        throw new Error("Chat context or model changed while rendering the view.");
    };
    await this.prepareCatalog();
    requireCurrent();
    const remote = runtime.adapter.kind === "remote" ? (runtime.adapter as DoorChatAdapter) : null;
    const context = runtime.context;
    const catalog =
      remote?.gallery && context && context.mode !== "ui_render"
        ? await remote.gallery.activeCatalog().catch(() => [])
        : undefined;
    requireCurrent();
    const response = await runtime.adapter.submit({
      message: prompt,
      history: [],
      route: { ...runtime.route },
      mode: context?.mode,
      catalog,
    });
    requireCurrent();
    const spec = response.canvasSpecs?.[0] ?? response.canvasSpec;
    const text = response.message.content.trim();
    if (!spec || response.historyEligible === false) throw new Error(text || "The chatbot did not return a view.");
    const validated = remote ? validateCanvasSpec(spec) : spec;
    let candidateId: string | undefined;
    if (remote?.gallery && context) {
      const candidate = await remote.gallery.saveCandidate({ spec: validated, title, prompt, mode: context.mode }).catch(() => undefined);
      requireCurrent();
      candidateId = candidate?.candidate_id;
    }
    await this.keepRegistered(response.registered);
    requireCurrent();
    return { spec: validated, candidateId, ...(text && text !== "Rendered the requested interface." ? { note: text } : {}) };
  }

  /** Restore only after the door authorizes a read in the current session. */
  async restoreView(candidateId: string, title: string): Promise<RenderedView> {
    const runtime = this.runtime;
    const remote = runtime?.adapter.kind === "remote" ? runtime.adapter as DoorChatAdapter : null;
    if (!runtime?.context || !remote?.gallery) throw new Error("Saved views are unavailable in this session.");
    const generation = this.dispatchGeneration;
    await this.prepareCatalog();
    if (this.disposed || generation !== this.dispatchGeneration) throw new Error("Chat context changed while restoring the view.");
    const candidate = await remote.gallery.getCandidate(candidateId);
    if (this.disposed || this.runtime?.adapter !== runtime.adapter || generation !== this.dispatchGeneration)
      throw new Error("Chat context changed while restoring the view.");
    if (candidate.mode !== runtime.context.mode || candidate.title !== title)
      throw new Error("The saved view does not match this page and chat mode.");
    return { spec: validateCanvasSpec(candidate.spec), candidateId };
  }

  /** Save components this reply defined so the UI renderer gallery can promote them. */
  private async keepRegistered(names: string[] | undefined): Promise<void> {
    const runtime = this.runtime;
    const remote = runtime?.adapter.kind === "remote" ? (runtime.adapter as DoorChatAdapter) : null;
    const gallery = remote?.gallery;
    const context = runtime?.context;
    if (!names?.length || !gallery || !context) return;
    await Promise.all(names.map(async (name) => {
      const component = registeredComponent(name);
      if (!component) return;
      await gallery.saveCandidate({
        spec: component.spec,
        title: component.name,
        prompt: component.description,
        mode: context.mode,
      }).catch(() => undefined);
    }));
  }

  async save(id: string, runtime = this.runtime, canvasIndex = 0) {
    if (!runtime || runtime.adapter.kind !== "remote" || !runtime.context)
      return;
    const gallery = (runtime.adapter as DoorChatAdapter).gallery;
    const message = this.threads
      .get(runtime.scopeKey)
      ?.messages.find((item) => item.id === id);
    const spec = message?.canvasSpecs?.[canvasIndex] ?? (canvasIndex === 0 ? message?.canvasSpec : undefined);
    if (!gallery || !spec || !message || message.savedCanvases?.includes(canvasIndex) || (canvasIndex === 0 && message.saved) || message.saving)
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
        spec,
        title: `${message.prompt ?? "Chat result"}${(message.canvasSpecs?.length ?? 0) > 1 ? ` · Block ${canvasIndex + 1}` : ""}`,
        prompt: message.prompt,
        mode: runtime.context.mode,
      });
      updateMessage({ saved: canvasIndex === 0 || message.saved, savedCanvases: [...(message.savedCanvases ?? []), canvasIndex], saving: false }, "Saved to candidates.");
    } catch (error) {
      updateMessage(
        { saving: false },
        `Could not save: ${errorMessage(error)}`,
      );
    }
  }

  dispose() {
    this.disposed = true;
    for (const scope of this.threads.keys()) removeScratchCatalogObject(scope);
    this.listeners.clear();
    this.threads.clear();
  }
}
