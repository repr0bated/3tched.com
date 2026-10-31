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
import { removeScratchCatalogObject } from "../json-render/references/chat-scratch";
import { acceptCanvasSpec } from "../json-render/references/canvas-contract";
import { registeredComponent } from "../json-render/references/registered-components";
import type { UiGallery } from "../chat/ui-gallery";
import { submitHumanReview } from "../chat/review-lanes";
import type { ChatRuntime } from "./chat-session";

export class Runtime {
  readonly adapter: ChatAdapter;
  providers = $state.raw<ProviderOption[]>([]);
  chatContext = $state.raw<ResolvedChatContext | null>(null);
  route = $state.raw<RouteSelection>({ providerId: "", modelId: "" });
  routeConfirmed = $state(false);
  routePending = $state(false);
  routeError = $state<string | null>(null);
  routeReadError = $state<string | null>(null);
  routeAttempt = $state.raw<RouteSelection | null>(null);
  catalogPending = $state(false);
  catalogError = $state<string | null>(null);
  interfacePending = $state(false);
  interfaceError = $state<string | null>(null);
  private interfaceScope: string | null = null;
  readonly canvases = new SvelteMap<string, Spec>();
  layout = $state<"balanced" | "conversation" | "canvas">("balanced");
  view = $state<"canvas" | "accountability" | "compliance" | "routing" | "threetched">(
    "canvas",
  );
  inspecting = $state(false);
  renderRevision = $state(0);
  pageTarget = $state.raw<{ id: string; accept: (spec: Spec) => void } | null>(null);
  private generation = 0;
  private disposed = false;
  private catalogRead: Promise<void> | null = null;
  constructor(adapter: ChatAdapter) {
    this.adapter = adapter;
    this.providers = adapter.providers;
    this.catalogError = adapter.catalogError ?? null;
    this.routeReadError = adapter.initialRouteError ?? null;
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
  get canvasSpec(): Spec | null {
    return this.canvases.get(this.scopeKey) ?? null;
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
      this.interfaceScope = null;
      this.interfacePending = false;
      this.interfaceError = null;
    }
    this.chatContext = context;
  };
  setCanvas = (spec: Spec, scope = this.scopeKey) => {
    if (!this.disposed) this.canvases.set(scope, spec);
  };
  /** Generate presentation only; never submit a chat turn or change the selected mode. */
  loadInterface = async (retry = false) => {
    const context = this.chatContext;
    const scope = this.scopeKey;
    if (
      this.disposed ||
      this.adapter.kind !== "remote" ||
      !context ||
      this.interfacePending ||
      (!retry && this.interfaceScope === scope) ||
      this.canvases.has(scope)
    ) return;
    const generation = this.generation;
    this.interfaceScope = scope;
    this.interfacePending = true;
    this.interfaceError = null;
    try {
      const response = await this.adapter.submit({
        mode: "ui_render",
        route: this.route,
        history: [],
        message: [
          "Render yourself first. Then render the menus and the canvas.",
          "You may be the only element, in a collapsed pane, once the page is loaded.",
          "Allowed render stack: Svelte 5, SvelteKit, @json-render/core, @json-render/svelte, and Zod. Use only catalog components. A spec is a flat { root, elements } map.",
          "The host draws nothing else.",
          "Do not claim that operations have run, invent system state, or infer root access from login.",
          `Current session context: ${JSON.stringify({
            mode: context.mode,
            memory_namespace: context.memory_namespace,
            read_only: context.read_only,
          })}`,
        ].join("\n"),
      });
      if (this.disposed || generation !== this.generation) return;
      if (!response.canvasSpec)
        throw new Error(response.message.content || "The chatbot returned no interface.");
      const accepted = acceptCanvasSpec(response.canvasSpec);
      const spec = accepted.spec;
      const gallery = this.adapter.kind === "remote"
        ? (this.adapter as { gallery?: Pick<UiGallery, "saveCandidate" | "suggestCandidate"> }).gallery
        : undefined;
      const mode = this.chatContext?.mode;
      if (gallery && mode && accepted.registered.length) {
        await Promise.all(accepted.registered.map(async (name) => {
          const component = registeredComponent(name);
          if (component) await submitHumanReview(gallery, component, mode).catch(() => undefined);
        }));
      }
      // A user-requested result or notebook read that arrived meanwhile takes precedence.
      if (!this.canvases.has(scope)) this.setCanvas(spec, scope);
    } catch (error) {
      if (!this.disposed && generation === this.generation)
        this.interfaceError = error instanceof Error ? error.message : "Interface generation failed.";
    } finally {
      if (!this.disposed && generation === this.generation) this.interfacePending = false;
    }
  };
  snapshot(): ChatRuntime {
    const scope = this.scopeKey;
    const pageTarget = this.pageTarget;
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
      setCanvas: (spec) => {
        this.setCanvas(spec, scope);
        if (!this.disposed && this.scopeKey === scope) pageTarget?.accept(spec);
      },
      clearCanvas: () => { this.canvases.delete(scope); },
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
        if (!this.disposed) {
          this.providers = next;
          this.catalogError = this.adapter.catalogError ?? null;
        }
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
        (!this.chatContext ||
          this.chatContext.mode === "control_plane" ||
          this.chatContext.mode === "ui_render"))
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
        this.routeReadError = null;
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
