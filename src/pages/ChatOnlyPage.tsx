import { useEffect, useState } from "react";
import { Renderer } from "@json-render/react";
import type { ChatAdapter } from "../chat/chat-adapter";
import {
  fetchIssuedIdentity,
  resolveIdentity,
} from "../chat/door-config";
import { connectDoorChatAdapter } from "../chat/door-chat-adapter";
import { createLocalChatAdapter } from "../chat/local-chat-adapter";
import { KnowledgeStrip } from "../chat/KnowledgeStrip";
import { ModeStrip } from "../chat/ModeStrip";
import { antigravitySpec } from "../json-render/pages/antigravity.pagespec";
import {
  JsonRenderProvider,
  useJsonRender,
} from "../json-render/runtime/JsonRenderProvider";
import { DoorError, normalizeDoorUrl, readSessionIdentity } from "../grpc/door";
import { DoorConnectPanel } from "./DoorConnectPanel";

function ChatOnlySurface({ adapter }: { adapter: ChatAdapter }) {
  const { registry } = useJsonRender();
  return (
    <main className="chat-only-page">
      <ModeStrip adapter={adapter} />
      <KnowledgeStrip adapter={adapter} />
      <Renderer key="chat-only" spec={antigravitySpec} registry={registry} />
    </main>
  );
}

type Gate =
  | { state: "resolving" }
  | { state: "connect"; error: string | null }
  | { state: "ready"; adapter: ChatAdapter };

function connectFailure(error: unknown): Gate {
  return {
    state: "connect",
    error: error instanceof Error ? error.message : "The door could not be reached.",
  };
}

export default function ChatOnlyPage() {
  const [attempt, setAttempt] = useState(0);
  const [gate, setGate] = useState<Gate>({ state: "resolving" });

  useEffect(() => {
    let cancelled = false;
    const resolve = async (): Promise<Gate> => {
      try {
        const projected = await resolveIdentity();
        if (cancelled) return { state: "resolving" };
        if (!projected) return {
          state: "connect",
          error: "Your server could not resolve your identity. Open this app through your configured identity connection, then retry.",
        };
        const identity = await readSessionIdentity({ url: projected.door, identity: projected.identity }, async () => {
          const fresh = await fetchIssuedIdentity();
          if (!fresh || normalizeDoorUrl(fresh.door) !== normalizeDoorUrl(projected.door)) {
            throw new DoorError("UNAUTHENTICATED", "Your identity connection could not provide a fresh assertion. Retry to reconnect.");
          }
          return fresh.identity;
        });
        if (cancelled) return { state: "resolving" };
        const adapter = await connectDoorChatAdapter({ url: projected.door, identity });
        return { state: "ready", adapter };
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
  }, [attempt]);

  const retry = () => {
    setGate({ state: "resolving" });
    setAttempt((current) => current + 1);
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
          error={gate.error}
          onRetry={retry}
          onUseLocal={() => setGate({ state: "ready", adapter: createLocalChatAdapter() })}
        />
      </main>
    );
  }

  return (
    <JsonRenderProvider adapter={gate.adapter}>
      <ChatOnlySurface adapter={gate.adapter} />
    </JsonRenderProvider>
  );
}
