import { useEffect, useState } from "react";
import type { ChatAdapter } from "./chat-adapter";
import type { DoorChatAdapter } from "./door-chat-adapter";
import type { DoorbellStatus } from "./doorbell";
import type { KnowledgePush } from "./knowledge-feed";

const SHOWN = 5;

function isDoorAdapter(adapter: ChatAdapter): adapter is DoorChatAdapter {
  return adapter.kind === "remote" && typeof (adapter as DoorChatAdapter).followKnowledge === "function";
}

function summary(push: KnowledgePush): string {
  if (typeof push.content === "string") return push.content;
  const content = push.content as Record<string, unknown> | null;
  for (const field of ["session_overview", "usage_tips", "resolution_steps", "suggested_next_steps"]) {
    const value = content?.[field];
    if (typeof value === "string" && value.trim()) return value;
    if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  }
  return push.trigger_reason;
}

function readableCode(value: string): string {
  const words = value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1).toLowerCase() : value;
}

/**
 * What the context engine pushed for this session, newest first. Values
 * come from the door; the doorbell only tells us when to look again.
 */
export function KnowledgeStrip({ adapter }: { adapter: ChatAdapter }) {
  const [pushes, setPushes] = useState<KnowledgePush[]>([]);
  const [status, setStatus] = useState<DoorbellStatus | null>(null);

  useEffect(() => {
    if (!isDoorAdapter(adapter)) return;
    return adapter.followKnowledge(
      (fresh) => setPushes((current) => [...fresh, ...current].slice(0, 50)),
      setStatus,
    );
  }, [adapter]);

  if (pushes.length === 0 && status?.state !== "closed") return null;

  return (
    <aside className="knowledge-strip" aria-label="Knowledge for this session">
      <header>
        <span>Knowledge</span>
        {status && status.state !== "subscribed" && (
          <span className="knowledge-strip__status" role="status">
            {status.state === "connecting"
              ? "Connecting…"
              : status.retryInMs === null
                ? `Disconnected: ${status.reason}`
                : `Reconnecting… ${status.reason}`}
          </span>
        )}
      </header>
      <ul>
        {pushes.slice(0, SHOWN).map((push) => (
          <li key={push.push_id} title={push.trigger_reason}>
            <span className="knowledge-strip__trigger">{readableCode(push.trigger)}</span> {summary(push)}
            {push.suggested_action && (
              <span className="knowledge-strip__suggestion"> Suggestion: {readableCode(push.suggested_action)}.</span>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
