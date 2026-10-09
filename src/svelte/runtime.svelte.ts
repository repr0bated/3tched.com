import { getContext, setContext } from "svelte";
import { SvelteMap } from "svelte/reactivity";
import type { Spec } from "@json-render/core";
import type {
  ChatAdapter,
  ProviderOption,
  RouteSelection,
} from "../chat/chat-adapter";
import type { ResolvedChatContext } from "../chat/chat-mode";
import { chatScopeKey } from "../chat/chat-scope";
import { initialCanvasSpec } from "../chat/local-chat-adapter";
import { removeScratchCatalogObject } from "../json-render/references/chat-scratch";
import type { ChatRuntime } from "./chat-session";

const empty: Spec = {
  root: "awaiting-canvas",
  elements: {
    "awaiting-canvas": {
      type: "text",
      props: {
        text: "Canvas content will appear here when returned by the chat.",
        className: null,
      },
    },
  },
};
export class Runtime {
  readonly adapter: ChatAdapter;
  providers = $state.raw<ProviderOption[]>([]);
  chatContext = $state.raw<ResolvedChatContext | null>(null);
  route = $state.raw<RouteSelection>({ providerId: "", modelId: "" });
  routeConfirmed = $state(false);
  routePending = $state(false);
  routeError = $state<string | null>(null);
  routeAttempt = $state.raw<RouteSelection | null>(null);
  catalogPending = $state(false);
  catalogError = $state<string | null>(null);
  readonly canvases = new SvelteMap<string, Spec>();
  layout = $state<"balanced" | "conversation" | "canvas">("balanced");
  view = $state<"canvas" | "accountability" | "compliance" | "routing" | "zeroclaw">(
    "canvas",
  );
  inspecting = $state(false);
  renderRevision = $state(0);
  private generation = 0;
  private disposed = false;
  private catalogRead: Promise<void> | null = null;
  constructor(adapter: ChatAdapter) {
    this.adapter = adapter;
    this.providers = adapter.providers;
    const fallback = {
      providerId: adapter.providers[0]?.id ?? "",
      modelId: adapter.providers[0]?.models[0]?.id ?? "",
    };
    if (adapter.kind === "remote" && adapter.committedRoute) {
      this.route = adapter.committedRoute;
      this.routeConfirmed = adapter.routeInitiallyApplied === true;
    } else {
      this.route = fallback;
    }
  }
  get scopeKey() {
    return chatScopeKey(this.chatContext, this.adapter.kind === "remote");
  }
  get canvasSpec() {
    return (
      this.canvases.get(this.scopeKey) ??
      (this.adapter.kind === "local" ? initialCanvasSpec : empty)
    );
  }
  setChatContext = (context: ResolvedChatContext) => {
    const previous = this.scopeKey;
    if (previous !== chatScopeKey(context, this.adapter.kind === "remote")) {
      this.generation++;
      removeScratchCatalogObject(previous);
      this.canvases.delete(previous);
      this.routePending = false;
      this.routeError = null;
      this.routeAttempt = null;
    }
    this.chatContext = context;
  };
  setCanvas = (spec: Spec, scope = this.scopeKey) => {
    if (!this.disposed) this.canvases.set(scope, spec);
  };
  snapshot(): ChatRuntime {
    const scope = this.scopeKey;
    return {
      adapter: this.adapter,
      scopeKey: scope,
      context: this.chatContext,
      route: this.route,
      layout: this.layout,
      modelLabel:
        this.providers
          .find((p) => p.id === this.route.providerId)
          ?.models.find((m) => m.id === this.route.modelId)?.label ??
        this.route.modelId,
      setCanvas: (spec) => this.setCanvas(spec, scope),
    };
  }
  refreshProviders = (): Promise<void> => {
    if (!this.adapter.refreshProviders || this.disposed)
      return Promise.resolve();
    if (this.catalogRead) return this.catalogRead;
    this.catalogPending = true;
    this.catalogError = null;
    this.catalogRead = this.adapter
      .refreshProviders()
      .then((next) => {
        if (!this.disposed) this.providers = next;
      })
      .catch((e: unknown) => {
        if (!this.disposed)
          this.catalogError =
            e instanceof Error ? e.message : "Model catalog refresh failed.";
      })
      .finally(() => {
        this.catalogRead = null;
        this.catalogPending = false;
      });
    return this.catalogRead;
  };
  applyRoute = async (next: RouteSelection) => {
    if (
      this.disposed ||
      this.routePending ||
      (this.adapter.kind === "remote" &&
        (!this.chatContext || this.chatContext.mode === "control_plane"))
    )
      return;
    const generation = this.generation;
    this.routePending = true;
    this.routeError = null;
    this.routeAttempt = next;
    try {
      const confirmed = await this.adapter.selectRoute(next);
      if (!this.disposed && generation === this.generation) {
        this.route = confirmed;
        this.routeConfirmed = true;
      }
    } catch (e) {
      if (!this.disposed && generation === this.generation)
        this.routeError =
          e instanceof Error ? e.message : "Route selection failed.";
    } finally {
      if (generation === this.generation) this.routePending = false;
    }
  };
  dispose() {
    this.disposed = true;
    this.generation++;
    removeScratchCatalogObject(this.scopeKey);
  }
}
const key = Symbol("chat-runtime");
export function provideRuntime(runtime: Runtime) {
  setContext(key, runtime);
}
export function getRuntime(): Runtime {
  const value = getContext<Runtime>(key);
  if (!value) throw new Error("Chat runtime is unavailable.");
  return value;
}
