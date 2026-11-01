/**
 * Knowledge pushes for this session: what the context engine committed to
 * the page's private state, re-read through the door whenever the doorbell
 * rings. The broker only says "something changed"; every value here came
 * from `ctl_plane_chatbot.list_knowledge` under the page's own credential.
 */
import type { DoorClient, DoorIdentity } from "../grpc/door";
import { subscribeDoorbell, doorbellPassword, type Doorbell, type DoorbellStatus } from "./doorbell";

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
  /** Existing proof factory, invoked separately for each MQTT CONNECT. */
  credential?: () => Promise<string>;
  /** Backward-compatible source when no asynchronous proof renewal is needed. */
  identity?: () => DoorIdentity;
  /** The owning identity/session scope; abort prevents late reads from escaping it. */
  signal?: AbortSignal;
  /** Called with the newest pushes first, only when something new arrived. */
  onKnowledge: (pushes: KnowledgePush[], revision: number) => void;
  onStatus?: (status: DoorbellStatus) => void;
  /** Test seam passed through to the doorbell. */
  socketFactory?: Parameters<typeof subscribeDoorbell>[0]["socketFactory"];
}
/**
 * Read the current window, then subscribe to content-free wake hints and
 * re-read authoritative knowledge state after every wake or reconnect.
 */
export async function startKnowledgeFeed(options: KnowledgeFeedOptions): Promise<KnowledgeFeed> {
  const { client, signal } = options;
  let seen = new Set<string>();
  let stopped = signal?.aborted ?? false;
  let dirty = false;
  let reading: Promise<void> | null = null;
  let doorbell: Doorbell | null = null;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    signal?.removeEventListener("abort", stop);
    doorbell?.stop();
  };
  if (!stopped) signal?.addEventListener("abort", stop, { once: true });

  const read = async () => {
    const { result } = await client.call<ListKnowledgeOutput>(CTL_PLANE_CHATBOT, "list_knowledge", {}, CHATBOT_READ);
    if (stopped) return;
    const fresh = result.knowledge.filter((push) => !seen.has(push.push_id));
    seen = new Set(result.knowledge.map((push) => push.push_id));
    if (!stopped && fresh.length > 0) options.onKnowledge(fresh, result.episode_revision);
  };

  const readOnce = (): Promise<void> => {
    if (stopped) return Promise.resolve();
    if (reading) {
      dirty = true;
      return reading;
    }
    reading = (async () => {
      do {
        dirty = false;
        try {
          await read();
        } catch (error) {
          if (!stopped) console.warn("[knowledge] re-read failed", error);
        }
      } while (dirty && !stopped);
    })().finally(() => {
      reading = null;
      if (dirty && !stopped) void readOnce();
    });
    return reading;
  };

  await readOnce();
  if (stopped) return { stop };

  let bell: DoorbellOutput;
  try {
    ({ result: bell } = await client.call<DoorbellOutput>(CTL_PLANE_CHATBOT, "get_doorbell", {}, CHATBOT_READ));
  } catch (error) {
    stop();
    throw error;
  }
  if (stopped) return { stop };
  const identity = options.identity;
  const credential = options.credential ?? (identity ? async () => doorbellPassword(identity()) : null);
  if (!credential) {
    stop();
    throw new Error("The knowledge feed has no current identity credential.");
  }
  const currentCredential = async () => {
    if (stopped || signal?.aborted) throw new Error("The knowledge feed is cancelled.");
    return credential();
  };
  try {
    doorbell = subscribeDoorbell({
      listener: bell.listener,
      ownerKey: bell.owner_key,
      topic: bell.topic,
      credential: currentCredential,
      onWake: () => { void readOnce(); },
      onStatus: (status) => {
        if (stopped) return;
        if (status.state === "subscribed") void readOnce();
        try {
          options.onStatus?.(status);
        } catch (error) {
          console.warn("[knowledge] status callback failed", error);
        }
      },
      socketFactory: options.socketFactory,
    });
    if (stopped) doorbell.stop();
  } catch (error) {
    stop();
    throw error;
  }

  return { stop };
}

