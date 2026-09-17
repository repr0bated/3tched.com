import { useEffect, useState } from "react";
import { Renderer } from "@json-render/react";
import type { ChatAdapter } from "../chat/chat-adapter";
import { defaultDoorUrl, injectedIdentity } from "../chat/door-config";
import { connectDoorChatAdapter } from "../chat/door-chat-adapter";
import { createLocalChatAdapter } from "../chat/local-chat-adapter";
import { antigravitySpec } from "../json-render/pages/antigravity.pagespec";
import {
  JsonRenderProvider,
  useJsonRender,
} from "../json-render/runtime/JsonRenderProvider";
import { DoorConnectPanel, type DoorConnectRequest } from "./DoorConnectPanel";

function ChatOnlySurface() {
  const { registry } = useJsonRender();
  return (
    <main className="chat-only-page">
      <Renderer key="chat-only" spec={antigravitySpec} registry={registry} />
    </main>
  );
}

type Gate =
  | { state: "connect"; connecting: boolean; error: string | null }
  | { state: "ready"; adapter: ChatAdapter };

function connectFailure(error: unknown): Gate {
  return {
    state: "connect",
    connecting: false,
    error: error instanceof Error ? error.message : "The door could not be reached.",
  };
}

export default function ChatOnlyPage() {
  // A host page that already authenticated the human can inject both the door
  // and the credential; connect on load without showing the form.
  const [autoConnect] = useState<DoorConnectRequest | null>(() => {
    const identity = injectedIdentity();
    const url = defaultDoorUrl();
    return identity && url ? { url, identity } : null;
  });
  const [gate, setGate] = useState<Gate>({
    state: "connect",
    connecting: autoConnect !== null,
    error: null,
  });

  useEffect(() => {
    if (!autoConnect) return;
    let cancelled = false;
    connectDoorChatAdapter(autoConnect)
      .then((adapter) => {
        if (!cancelled) setGate({ state: "ready", adapter });
      })
      .catch((error: unknown) => {
        if (!cancelled) setGate(connectFailure(error));
      });
    return () => {
      cancelled = true;
    };
  }, [autoConnect]);

  const connect = async ({ url, identity }: DoorConnectRequest) => {
    setGate({ state: "connect", connecting: true, error: null });
    try {
      const adapter = await connectDoorChatAdapter({ url, identity });
      setGate({ state: "ready", adapter });
    } catch (error) {
      setGate(connectFailure(error));
    }
  };

  if (gate.state === "connect") {
    return (
      <main className="chat-only-page">
        <DoorConnectPanel
          connecting={gate.connecting}
          error={gate.error}
          onConnect={(request) => void connect(request)}
          onUseLocal={() => setGate({ state: "ready", adapter: createLocalChatAdapter() })}
        />
      </main>
    );
  }

  return (
    <JsonRenderProvider adapter={gate.adapter}>
      <ChatOnlySurface />
    </JsonRenderProvider>
  );
}
