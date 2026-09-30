import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { removeScratchCatalogObject } from "../json-render/references/chat-scratch";
import type { Spec } from "@json-render/core";
import type {
  ChatAdapter,
  ProviderOption,
  RouteSelection,
} from "./chat-adapter";
import { initialCanvasSpec } from "./local-chat-adapter";
import type { ResolvedChatContext } from "./chat-mode";

interface ChatRuntimeValue {
  adapter: ChatAdapter;
  providers: ProviderOption[];
  route: RouteSelection;
  routePending: boolean;
  routeError: string | null;
  catalogPending: boolean;
  catalogError: string | null;
  refreshProviders: () => Promise<void>;
  chatContext: ResolvedChatContext | null;
  scopeKey: string;
  setChatContext: (context: ResolvedChatContext) => void;
  canvasSpec: Spec;
  setCanvasSpec: (spec: Spec) => void;
  selectProvider: (providerId: string) => Promise<void>;
  selectModel: (modelId: string) => Promise<void>;
}

const ChatRuntimeContext = createContext<ChatRuntimeValue | null>(null);

/** The door's resolved session scope is the authority for both thread and Canvas. */
export function chatScopeKey(context: ResolvedChatContext | null, remote: boolean): string {
  if (!remote) return "local";
  if (!context) return "awaiting-door";
  return encodeURIComponent(JSON.stringify([
    context.session_id,
    context.mode,
    context.project_id,
    context.memory_namespace,
  ]));
}

export function chatMessagesPath(streamId: string, scopeKey: string): string {
  return `/streams/${streamId}/scopes/${scopeKey}/messages`;
}

export function ChatRuntimeProvider({
  adapter,
  children,
}: {
  adapter: ChatAdapter;
  children: ReactNode;
}) {
  const [providers, setProviders] = useState(adapter.providers);
  const [route, setRoute] = useState<RouteSelection>(() => {
    const firstProvider = adapter.providers[0];
    if (!firstProvider) throw new Error("ChatAdapter must expose at least one provider.");
    return { providerId: firstProvider.id, modelId: firstProvider.models[0]?.id ?? "" };
  });
  const [catalogPending, setCatalogPending] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const catalogRead = useRef<Promise<void> | null>(null);
  const refreshProviders = (): Promise<void> => {
    if (!adapter.refreshProviders) return Promise.resolve();
    if (catalogRead.current) return catalogRead.current;
    setCatalogPending(true);
    setCatalogError(null);
    catalogRead.current = adapter.refreshProviders().then(setProviders).catch((error: unknown) => {
      setCatalogError(error instanceof Error ? error.message : "Model catalog refresh failed.");
    }).finally(() => {
      setCatalogPending(false);
      catalogRead.current = null;
    });
    return catalogRead.current;
  };
  const [routePending, setRoutePending] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [chatContext, setChatContext] = useState<ResolvedChatContext | null>(null);
  const [canvasByScope, setCanvasByScope] = useState<Map<string, Spec>>(() => new Map());
  const scopeKey = chatScopeKey(chatContext, adapter.kind === "remote");
  useEffect(() => {
    const key = scopeKey;
    return () => {
      removeScratchCatalogObject(key);
      setCanvasByScope((previous) => {
        if (!previous.has(key)) return previous;
        const next = new Map(previous);
        next.delete(key);
        return next;
      });
    };
  }, [scopeKey]);
  const canvasSpec = canvasByScope.get(scopeKey) ?? initialCanvasSpec;
  const setCanvasSpec = (spec: Spec) => {
    setCanvasByScope(previous => new Map(previous).set(scopeKey, spec));
  };

  const commitRoute = async (next: RouteSelection) => {
    setRoutePending(true);
    setRouteError(null);
    try {
      setRoute(await adapter.selectRoute(next));
    } catch (error) {
      setRouteError(error instanceof Error ? error.message : "Route selection failed.");
    } finally {
      setRoutePending(false);
    }
  };

  const value: ChatRuntimeValue = {
    adapter,
    providers,
    catalogPending,
    catalogError,
    refreshProviders,
    route,
    routePending,
    routeError,
    chatContext,
    scopeKey,
    setChatContext,
    canvasSpec,
    setCanvasSpec,
    selectProvider: async (providerId) => {
      const provider = providers.find((entry) => entry.id === providerId);
      const model = provider?.models[0];
      if (!provider) return;
      if (!model) {
        setRoute({ providerId: provider.id, modelId: "" });
        setRouteError(`${provider.label} has no models yet.`);
        return;
      }
      await commitRoute({ providerId: provider.id, modelId: model.id });
    },
    selectModel: async (modelId) => {
      await commitRoute({ ...route, modelId });
    },
  };

  return <ChatRuntimeContext.Provider value={value}>{children}</ChatRuntimeContext.Provider>;
}

export function useChatRuntime(): ChatRuntimeValue {
  const value = useContext(ChatRuntimeContext);
  if (!value) {
    throw new Error("useChatRuntime must be used inside ChatRuntimeProvider.");
  }
  return value;
}
