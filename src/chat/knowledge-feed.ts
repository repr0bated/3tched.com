/**
 * Knowledge pushes for this session: what the context engine committed to
 * the page's private state, re-read through the door whenever the doorbell
 * rings. The broker only says "something changed"; every value here came
 * from `ctl_plane_chatbot.list_knowledge` under the page's own credential.
 */
import type { DoorClient, DoorIdentity } from "../grpc/door";
import { ringDoorbell, doorbellPassword, type Doorbell, type DoorbellStatus } from "./doorbell";

export const CTL_PLANE_CHATBOT = "ctl_plane_chatbot";
export const CHATBOT_READ = "chatbot.read";

export interface KnowledgePush {
  push_id: string;
  source_id: string;
  created_at: string;
  trigger: string;
  trigger_reason: string;
  relevance_score: number;
  content: unknown;
  suggested_action: string | null;
}

interface DoorbellOutput {
  owner_key: string;
  topic: string;
  listener: string;
}

interface ListKnowledgeOutput {
  knowledge: KnowledgePush[];
  knowledge_count: number;
  episode_revision: number;
  knowledge_truncated: boolean;
}

export interface KnowledgeFeed {
  stop(): void;
}

export interface KnowledgeFeedOptions {
  client: DoorClient;
  /** The credential the page currently carries (renewed OIA1 or SID1). */
  identity: () => DoorIdentity;
  /** Called with the newest pushes first, only when something new arrived. */
  onKnowledge: (pushes: KnowledgePush[], revision: number) => void;
  onStatus?: (status: DoorbellStatus) => void;
  /** Test seam passed through to the doorbell. */
  socketFactory?: Parameters<typeof ringDoorbell>[0]["socketFactory"];
}

/**
 * Read the current window, then ring the doorbell and re-read on every wake
 * whose `seq` is newer than the last revision seen.
 */
export async function startKnowledgeFeed(options: KnowledgeFeedOptions): Promise<KnowledgeFeed> {
  const { client } = options;
  let revision = -1;
  let seen = new Set<string>();
  let stopped = false;
  let reading: Promise<void> | null = null;

  const read = async () => {
    const { result } = await client.call<ListKnowledgeOutput>(CTL_PLANE_CHATBOT, "list_knowledge", {}, CHATBOT_READ);
    if (stopped) return;
    const fresh = result.knowledge.filter((push) => !seen.has(push.push_id));
    seen = new Set(result.knowledge.map((push) => push.push_id));
    revision = Math.max(revision, result.episode_revision);
    if (fresh.length > 0) options.onKnowledge(fresh, result.episode_revision);
  };

  const readOnce = () => {
    if (reading) return reading;
    reading = read()
      .catch((error) => console.warn("[knowledge] re-read failed", error))
      .finally(() => {
        reading = null;
      });
    return reading;
  };

  await readOnce();
  if (stopped) return { stop() {} };

  const { result: bell } = await client.call<DoorbellOutput>(CTL_PLANE_CHATBOT, "get_doorbell", {}, CHATBOT_READ);
  const doorbell: Doorbell = ringDoorbell({
    listener: bell.listener,
    ownerKey: bell.owner_key,
    topic: bell.topic,
    credential: async () => doorbellPassword(options.identity()),
    onWake: (seq) => {
      if (seq > revision) void readOnce();
    },
    onStatus: (status) => {
      // A reconnect may have missed wakes: re-read once subscribed again.
      if (status.state === "subscribed") void readOnce();
      options.onStatus?.(status);
    },
    socketFactory: options.socketFactory,
  });

  return {
    stop() {
      stopped = true;
      doorbell.stop();
    },
  };
}
