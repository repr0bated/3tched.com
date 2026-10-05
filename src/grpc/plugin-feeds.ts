import { Value } from "./gen/google/protobuf/struct";
import { ChangeType, StateFrameKind, type StateChange, type SubscribeRequest } from "./gen/operation";
import { DoorError, PLUGIN_OBJECT_ROOT, type DoorClient } from "./door";

export const PUBLIC_FEED_REQUEST: SubscribeRequest = {
  pluginIds: [], pathPatterns: [], tags: [], includeInitialState: true, includeSchema: true,
};

const unsafeSegments = new Set([".", "..", "__proto__", "constructor", "prototype"]);

/** Wire convention from op_plugins::canonical::{plugin_path,
 * sanitize_plugin_name}. The sealed ID remains the UI key; its D-Bus path
 * lowercases, replaces hyphens, and prefixes an initial ASCII digit. */
export function feedPluginObjectPath(pluginId: string): string {
  if (!/^[A-Za-z0-9_.-]+$/.test(pluginId)) throw new DoorError("DATA_LOSS", "Invalid plugin ID.");
  let segment = pluginId.toLowerCase().replace(/-/g, "_");
  if (/^[0-9]/.test(segment)) segment = `plugin_${segment}`;
  if (unsafeSegments.has(pluginId) || unsafeSegments.has(segment)) throw new DoorError("DATA_LOSS", "Unsafe plugin ID.");
  return `${PLUGIN_OBJECT_ROOT}/${segment}`;
}

export type FeedStatus =
  | { state: "idle" } | { state: "connecting" } | { state: "live" }
  | { state: "reconnecting" | "error"; code: string; message: string; retryInMs: number | null };
export interface PluginFeed {
  schema?: unknown;
  schemaHash: string;
  catalogHash: string;
  generation: string;
  removed: boolean;
  /** Complete authoritative selected views, replaced rather than patched. */
  paths: Readonly<Record<string, { value: unknown; schemaHash: string; generation: string }>>;
  stateStatus: "available" | "withheld-or-unavailable" | "removed";
}
export interface FeedSnapshot {
  namespace: string;
  plugins: Readonly<Record<string, PluginFeed>>;
  catalogHash: string;
  generation: string;
  status: FeedStatus;
}
export const emptyFeedSnapshot = (namespace = "public"): FeedSnapshot => ({
  namespace, plugins: {}, catalogHash: "", generation: "0", status: { state: "idle" },
});

/** Cursors belong to this subscription namespace + plugin + schema/object path.
 * Audit event IDs are independent and never used as state revisions. */
export class FeedReducer {
  private revisions = new Map<string, bigint>();
  private deletions = new Map<string, { pluginId: string; path: string; generation: bigint }>();
  constructor(public snapshot = emptyFeedSnapshot()) {}
  reset(status: FeedStatus): FeedSnapshot {
    this.revisions.clear();
    this.deletions.clear();
    this.snapshot = { ...emptyFeedSnapshot(this.snapshot.namespace), status };
    return this.snapshot;
  }
  apply(frame: StateChange): FeedSnapshot {
    if (!/^\d+$/.test(frame.stateGeneration)) throw new DoorError("DATA_LOSS", "Invalid state generation.");
    const generation = BigInt(frame.stateGeneration);
    const schemaFrame = frame.changeType === ChangeType.SCHEMA_MIGRATION;
    if (frame.frameKind === StateFrameKind.HEARTBEAT) {
      if (generation >= BigInt(this.snapshot.generation)) this.snapshot = { ...this.snapshot, catalogHash: frame.catalogHash, generation: frame.stateGeneration };
      return this.snapshot;
    }
    const root = feedPluginObjectPath(frame.pluginId);
    if (!(frame.objectPath === root || frame.objectPath.startsWith(`${root}/`)) ||
        frame.objectPath.split("/").some(segment => unsafeSegments.has(segment))) {
      throw new DoorError("DATA_LOSS", "Invalid plugin state path.");
    }
    const key = `${frame.pluginId}:${schemaFrame ? "schema" : frame.objectPath}`;
    if (generation < (this.revisions.get(key) ?? -1n)) return this.snapshot;
    const previous = Object.hasOwn(this.snapshot.plugins, frame.pluginId) ? this.snapshot.plugins[frame.pluginId] : undefined;
    if (!schemaFrame && previous?.removed && generation <= BigInt(previous.generation)) return this.snapshot;
    if (!schemaFrame && [...this.deletions.values()].some(tombstone =>
      tombstone.pluginId === frame.pluginId && frame.objectPath.startsWith(`${tombstone.path}/`) &&
      generation <= tombstone.generation)) return this.snapshot;
    this.revisions.set(key, generation);
    const newer = !previous || generation >= BigInt(previous.generation);
    const feed: PluginFeed = { ...(previous ?? { schemaHash: "", paths: {}, removed: false, stateStatus: "withheld-or-unavailable" }),
      catalogHash: newer ? frame.catalogHash : previous!.catalogHash,
      generation: newer ? frame.stateGeneration : previous!.generation };
    if (schemaFrame) {
      feed.schema = frame.newValue ? Value.toJson(frame.newValue) : undefined;
      feed.schemaHash = frame.schemaHash;
      feed.removed = !frame.newValue;
      if (feed.removed) feed.paths = {};
      else if (previous?.removed) {
        for (const [key, tombstone] of this.deletions) if (tombstone.pluginId === frame.pluginId) this.deletions.delete(key);
      }
    } else {
      const paths = { ...feed.paths };
      if (frame.changeType === ChangeType.OBJECT_REMOVED || frame.changeType === ChangeType.PROPERTY_DELETE || !frame.newValue) {
        this.deletions.set(`${frame.pluginId}:${frame.objectPath}`, { pluginId: frame.pluginId, path: frame.objectPath, generation });
        for (const path of Object.keys(paths)) if (path === frame.objectPath || path.startsWith(`${frame.objectPath}/`)) delete paths[path];
      } else {
        this.deletions.delete(`${frame.pluginId}:${frame.objectPath}`);
        paths[frame.objectPath] = { value: Value.toJson(frame.newValue), schemaHash: frame.schemaHash, generation: frame.stateGeneration };
      }
      feed.paths = paths;
    }
    feed.stateStatus = feed.removed ? "removed" : Object.values(feed.paths).some(path => path.schemaHash === feed.schemaHash)
      ? "available" : "withheld-or-unavailable";
    const latest = generation >= BigInt(this.snapshot.generation);
    this.snapshot = { ...this.snapshot, plugins: { ...this.snapshot.plugins, [frame.pluginId]: feed },
      ...(latest ? { generation: frame.stateGeneration, catalogHash: frame.catalogHash } : {}) };
    return this.snapshot;
  }
}

/** Only explicit transport availability or signed-proof expiry gets retries.
 * Identity changes, capability denial, revocation and malformed frames stop. */
export function canRetryFeed(error: unknown): boolean {
  return error instanceof DoorError && (["UNAVAILABLE", "DEADLINE_EXCEEDED"].includes(error.code) ||
    (error.code === "UNAUTHENTICATED" && error.statusDetail === "Expired"));
}

export class PluginFeedStore {
  private reducer: FeedReducer;
  private listeners = new Set<() => void>();
  private controller?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  private users = 0;
  constructor(private client: Pick<DoorClient, "subscribeState">,
    private request = PUBLIC_FEED_REQUEST, namespace = "public", private capability?: string) {
    this.reducer = new FeedReducer(emptyFeedSnapshot(namespace));
  }
  getSnapshot = (): FeedSnapshot => this.reducer.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private publish() { this.listeners.forEach(listener => listener()); }
  acquire = (): (() => void) => {
    if (++this.users === 1) this.connect(0);
    let released = false;
    return () => { if (!released) { released = true; if (--this.users === 0) this.stop(); } };
  };
  restart(): void {
    this.stop();
    if (this.users > 0) this.connect(0);
  }
  private stop(): void {
    this.controller?.abort();
    this.controller = undefined;
    clearTimeout(this.timer);
    this.reducer.reset({ state: "idle" });
    this.publish();
  }
  private connect(attempt: number): void {
    const controller = new AbortController();
    this.controller = controller;
    this.reducer.reset({ state: "connecting" });
    this.publish();
    let received = false;
    let connectedAt = Date.now();
    const current = () => !controller.signal.aborted && this.controller === controller;
    void this.client.subscribeState(this.request, {
      signal: controller.signal, capability: this.capability,
      onReady: () => { if (current()) { connectedAt = Date.now(); this.reducer.snapshot = { ...this.reducer.snapshot, status: { state: "live" } }; this.publish(); } },
      onFrame: frame => { if (current()) { this.reducer.apply(frame); received = true; this.publish(); } },
    }).then(() => {
      if (current()) throw new DoorError("UNAVAILABLE", "The state stream ended.");
    }).catch((error: unknown) => {
      if (!current()) return;
      const renewing = error instanceof DoorError && error.code === "UNAUTHENTICATED" && error.statusDetail === "Expired";
      // A server that hydrates then immediately drops must still exhaust its
      // retry budget. Healthy accepted proof renewal starts a fresh lifecycle.
      const retries = received && (renewing || Date.now() - connectedAt >= 30_000) ? 0 : attempt;
      const retry = retries < 5 && canRetryFeed(error);
      const delay = retry ? Math.min(1000 * 2 ** retries, 30_000) : null;
      // Failed identity/transport state must not remain a usable UI value.
      this.reducer.reset({ state: retry ? "reconnecting" : "error",
        code: error instanceof DoorError ? error.code : "INTERNAL",
        message: error instanceof Error ? error.message : "Plugin feed failed.", retryInMs: delay });
      this.publish();
      if (delay !== null) this.timer = setTimeout(() => { if (current()) this.connect(retries + 1); }, delay);
    });
  }
}

/** Root values are the selected public tree. Schemas/pins are metadata only;
 * received schema never becomes an alternate plugin contract authority. */
export function pluginStateBindings(snapshot: FeedSnapshot): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [id, feed] of Object.entries(snapshot.plugins)) {
    const root = feed.paths[feedPluginObjectPath(id)];
    if (!feed.removed && root && root.schemaHash === feed.schemaHash) values[id] = root.value;
  }
  return values;
}
