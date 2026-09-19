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
  if (push.suggested_action) return push.suggested_action;
  if (typeof push.content === "string") return push.content;
  const content = push.content as Record<string, unknown> | null;
  const tips = content?.usage_tips;
  if (Array.isArray(tips) && typeof tips[0] === "string") return tips[0];
  return push.trigger_reason;
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

  if (pushes.length === 0) return null;

  return (
    <aside className="knowledge-strip" aria-label="Knowledge for this session">
      <header>
        <span>Knowledge</span>
        {status && status.state !== "subscribed" && (
          <span className="knowledge-strip__status" title={status.state === "closed" ? status.reason : undefined}>
            {status.state === "connecting" ? "connecting…" : "reconnecting…"}
          </span>
        )}
      </header>
      <ul>
        {pushes.slice(0, SHOWN).map((push) => (
          <li key={push.push_id} title={push.trigger_reason}>
            <span className="knowledge-strip__trigger">{push.trigger}</span> {summary(push)}
          </li>
        ))}
      </ul>
    </aside>
  );
}
