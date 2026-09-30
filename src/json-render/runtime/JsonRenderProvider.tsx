import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import {
  ActionProvider,
  StateProvider,
  VisibilityProvider,
  createStateStore,
  type ComponentRegistry,
} from "@json-render/react";
import { ChatRuntimeProvider } from "../../chat/ChatRuntimeProvider";
import type { ChatAdapter } from "../../chat/chat-adapter";
import { createLocalChatAdapter } from "../../chat/local-chat-adapter";
import { WorkbenchProvider } from "../../workbench/WorkbenchProvider";
import { chatRegistry } from "../catalog/chat-registry";

interface JsonRenderContextValue {
  registry: ComponentRegistry;
}

const JsonRenderContext = createContext<JsonRenderContextValue | null>(null);

export function JsonRenderProvider({
  children,
  adapter,
}: {
  children: ReactNode;
  adapter?: ChatAdapter;
}) {
  const [store] = useState(() =>
    createStateStore({
      streams: {
        stream_antigravity_01: {
          messages: [],
        },
      },
    }),
  );
  const [resolvedAdapter] = useState(
    () => adapter ?? createLocalChatAdapter(),
  );

  return (
    <JsonRenderContext.Provider value={{ registry: chatRegistry }}>
      <StateProvider store={store}>
        <VisibilityProvider>
          {/* setState is the pinned @json-render/react built-in. The catalog
              declaration is the allowlist; no host method invoker is installed. */}
          <ActionProvider>
            <ChatRuntimeProvider adapter={resolvedAdapter}>
              <WorkbenchProvider>{children}</WorkbenchProvider>
            </ChatRuntimeProvider>
          </ActionProvider>
        </VisibilityProvider>
      </StateProvider>
    </JsonRenderContext.Provider>
  );
}

export function useJsonRender(): JsonRenderContextValue {
  const value = useContext(JsonRenderContext);
  if (!value) {
    throw new Error("useJsonRender must be used inside JsonRenderProvider.");
  }
  return value;
}
