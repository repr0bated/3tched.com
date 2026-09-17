import { useEffect, useState } from "react";
import { Renderer } from "@json-render/react";
import type { ChatAdapter } from "../chat/chat-adapter";
import { defaultDoorUrl, fetchProjectedIdentity, injectedIdentity } from "../chat/door-config";
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
  | { state: "resolving" }
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
  // Identity resolution order: injected by the host page, then the page's own
  // origin (op-web maps the WireGuard arrival to its SID1), then the gate.
  const [injected] = useState<DoorConnectRequest | null>(() => {
    const identity = injectedIdentity();
    const url = defaultDoorUrl();
    return identity && url ? { url, identity } : null;
  });
  const [gate, setGate] = useState<Gate>({ state: "resolving" });

  useEffect(() => {
    let cancelled = false;
    const resolve = async (): Promise<Gate> => {
      const request =
        injected ??
        (await fetchProjectedIdentity().then((projected) =>
          projected ? { url: projected.door, identity: projected.identity } : null,
        ));
      if (!request) return { state: "connect", connecting: false, error: null };
      try {
        return { state: "ready", adapter: await connectDoorChatAdapter(request) };
      } catch (error) {
        return connectFailure(error);
      }
    };
    void resolve().then((next) => {
      if (!cancelled) setGate(next);
    });
    return () => {
      cancelled = true;
    };
  }, [injected]);

  const connect = async ({ url, identity }: DoorConnectRequest) => {
    setGate({ state: "connect", connecting: true, error: null });
    try {
      const adapter = await connectDoorChatAdapter({ url, identity });
      setGate({ state: "ready", adapter });
    } catch (error) {
      setGate(connectFailure(error));
    }
  };

  if (gate.state === "resolving") {
    return (
      <main className="chat-only-page">
        <p className="door-resolving" role="status" aria-live="polite">
          Resolving your identity…
        </p>
      </main>
    );
  }

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
