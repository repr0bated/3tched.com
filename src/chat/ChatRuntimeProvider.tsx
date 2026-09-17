import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import type { Spec } from "@json-render/core";
import type {
  ChatAdapter,
  ProviderOption,
  RouteSelection,
} from "./chat-adapter";
import { initialCanvasSpec } from "./local-chat-adapter";

interface ChatRuntimeValue {
  adapter: ChatAdapter;
  providers: ProviderOption[];
  route: RouteSelection;
  routePending: boolean;
  routeError: string | null;
  canvasSpec: Spec;
  setCanvasSpec: (spec: Spec) => void;
  selectProvider: (providerId: string) => Promise<void>;
  selectModel: (modelId: string) => Promise<void>;
}

const ChatRuntimeContext = createContext<ChatRuntimeValue | null>(null);

export function ChatRuntimeProvider({
  adapter,
  children,
}: {
  adapter: ChatAdapter;
  children: ReactNode;
}) {
  const firstProvider = adapter.providers[0];
  const firstModel = firstProvider?.models[0];
  if (!firstProvider || !firstModel) {
    throw new Error("ChatAdapter must expose at least one provider and model.");
  }

  const [route, setRoute] = useState<RouteSelection>({
    providerId: firstProvider.id,
    modelId: firstModel.id,
  });
  const [routePending, setRoutePending] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [canvasSpec, setCanvasSpec] = useState<Spec>(initialCanvasSpec);

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
    providers: adapter.providers,
    route,
    routePending,
    routeError,
    canvasSpec,
    setCanvasSpec,
    selectProvider: async (providerId) => {
      const provider = adapter.providers.find((entry) => entry.id === providerId);
      const model = provider?.models[0];
      if (!provider || !model) return;
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
