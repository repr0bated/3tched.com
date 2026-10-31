import { afterEach, describe, expect, it, vi } from "vitest";
import type { DoorClient } from "../grpc/door";
import { startKnowledgeFeed, type KnowledgePush } from "./knowledge-feed";
import type { WebSocketLike } from "./doorbell";

const OWNER = "cd".repeat(32);

interface KnowledgeResult {
  knowledge: KnowledgePush[];
  knowledge_count: number;
  episode_revision: number;
  knowledge_truncated: boolean;
}

function push(id: string): KnowledgePush {
  return {
    push_id: id,
    source_id: `src-${id}`,
    created_at: "2026-09-19T15:00:00Z",
    trigger: "ErrorAssistance",
    trigger_reason: "repeated build error",
    relevance_score: 0.9,
    content: { usage_tips: ["check first"] },
    suggested_action: "run rust_pro check",
  };
}

class FakeSocket implements WebSocketLike {
  binaryType = "blob";
  readyState = 0;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: ArrayBuffer | Blob | string }) => void) | null = null;
  onclose: ((ev: { code?: number; reason?: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  sent: Uint8Array[] = [];
  closed = false;
  send(data: ArrayBuffer | Uint8Array) {
    this.sent.push(data instanceof Uint8Array ? data : new Uint8Array(data));
  }
  close() { this.closed = true; }
  async deliver(bytes: number[]) {
    const copy = new ArrayBuffer(bytes.length);
    new Uint8Array(copy).set(bytes);
    await this.onmessage?.({ data: copy });
  }
}

function wake(topic: string, seq: number): number[] {
  const t = Array.from(new TextEncoder().encode(topic));
  const p = Array.from(new TextEncoder().encode(JSON.stringify({ seq })));
  const body = [t.length >> 8, t.length & 0xff, ...t, 0, 1, ...p];
  return [0x32, body.length, ...body];
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function knowledgeResult(knowledge: KnowledgePush[], episode_revision: number): KnowledgeResult {
  return { knowledge, knowledge_count: knowledge.length, episode_revision, knowledge_truncated: false };
}

afterEach(() => vi.restoreAllMocks());

describe("knowledge feed", () => {
  it("rereads authoritative knowledge even when wake sequence is equal to or below its revision", async () => {
    let window: KnowledgePush[] = [push("2")];
    let revision = 2;
    let completedFirstRead = false;
    const subscribedReadDone = deferred<void>();
    const client = {
      call: vi.fn(async (_plugin: string, method: string) => {
        if (method === "get_doorbell") {
          return {
            result: { owner_key: OWNER, topic: `opdbus/wake/${OWNER}`, listener: "wss://10.0.0.3:8084" },
            eventId: "",
            eventHash: "",
          };
        }
        if (completedFirstRead) subscribedReadDone.resolve();
        completedFirstRead = true;
        return { result: knowledgeResult(window, revision), eventId: "", eventHash: "" };
      }),
    } as unknown as DoorClient;
    const sockets: FakeSocket[] = [];
    const onKnowledge = vi.fn();
    const feed = await startKnowledgeFeed({
      client,
      credential: async () => "sid1:proof",
      onKnowledge,
      socketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
    });
    expect(onKnowledge.mock.calls[0][0].map((item: KnowledgePush) => item.push_id)).toEqual(["2"]);

    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    const ws = sockets[0];
    ws.onopen?.({});
    await ws.deliver([0x20, 2, 0, 0]);
    await ws.deliver([0x90, 3, 0, 1, 1]);
    await subscribedReadDone.promise;

    window = [push("3"), ...window];
    await ws.deliver(wake(`opdbus/wake/${OWNER}`, 2));
    await vi.waitFor(() => expect(onKnowledge.mock.calls.some(
      (call) => (call[0] as KnowledgePush[]).some((item) => item.push_id === "3"),
    )).toBe(true));

    window = [push("4"), ...window];
    revision = 4;
    await ws.deliver(wake(`opdbus/wake/${OWNER}`, 1));
    await vi.waitFor(() => expect(onKnowledge.mock.calls.some(
      (call) => (call[0] as KnowledgePush[]).some((item) => item.push_id === "4"),
    )).toBe(true));
    feed.stop();
    expect(ws.closed).toBeTruthy();
  });

  it("repeats an authoritative read when another wake arrives during a pending read", async () => {
    let window: KnowledgePush[] = [push("1")];
    let hold = false;
    let completedInitialRead = false;
    const firstWakeRead = deferred<KnowledgeResult>();
    const readStarted = deferred<void>();
    const subscribedReadDone = deferred<void>();
    const client = {
      call: vi.fn(async (_plugin: string, method: string) => {
        if (method === "get_doorbell") {
          return { result: { owner_key: OWNER, topic: `opdbus/wake/${OWNER}`, listener: "wss://10.0.0.3:8084" }, eventId: "", eventHash: "" };
        }
        if (hold) {
          hold = false;
          readStarted.resolve();
          return { result: await firstWakeRead.promise, eventId: "", eventHash: "" };
        }
        if (completedInitialRead) subscribedReadDone.resolve();
        completedInitialRead = true;
        return { result: knowledgeResult(window, 1), eventId: "", eventHash: "" };
      }),
    } as unknown as DoorClient;
    const onKnowledge = vi.fn();
    const sockets: FakeSocket[] = [];
    const feed = await startKnowledgeFeed({
      client,
      credential: async () => "sid1:proof",
      onKnowledge,
      socketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
    });
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    const ws = sockets[0];
    ws.onopen?.({});
    await ws.deliver([0x20, 2, 0, 0]);
    await ws.deliver([0x90, 3, 0, 1, 1]);
    await subscribedReadDone.promise;

    hold = true;
    await ws.deliver(wake(`opdbus/wake/${OWNER}`, 2));
    await readStarted.promise;
    window = [push("2"), ...window];
    await ws.deliver(wake(`opdbus/wake/${OWNER}`, 1));
    firstWakeRead.resolve(knowledgeResult([push("1")], 1));
    await vi.waitFor(() => expect(onKnowledge.mock.calls.some(
      (call) => (call[0] as KnowledgePush[]).some((item) => item.push_id === "2"),
    )).toBe(true));
    feed.stop();
  });

  it("aborts an initial read without emitting old-scope knowledge or discovering a doorbell", async () => {
    const initial = deferred<KnowledgeResult>();
    const discover = vi.fn();
    const credential = vi.fn(async () => "sid1:proof");
    const onKnowledge = vi.fn();
    const controller = new AbortController();
    const client = {
      call: vi.fn(async (_plugin: string, method: string) => {
        if (method === "get_doorbell") {
          discover();
          return { result: { owner_key: OWNER, topic: `opdbus/wake/${OWNER}`, listener: "wss://10.0.0.3:8084" }, eventId: "", eventHash: "" };
        }
        return { result: await initial.promise, eventId: "", eventHash: "" };
      }),
    } as unknown as DoorClient;
    const feedPromise = startKnowledgeFeed({
      client,
      signal: controller.signal,
      credential,
      onKnowledge,
    });
    controller.abort();
    initial.resolve(knowledgeResult([push("old-scope")], 1));
    const feed = await feedPromise;
    expect(onKnowledge).not.toHaveBeenCalled();
    expect(discover).not.toHaveBeenCalled();
    expect(credential).not.toHaveBeenCalled();
    feed.stop();
  });

  it("does not connect after abort during metadata lookup", async () => {
    const metadata = deferred<{ owner_key: string; topic: string; listener: string }>();
    const metadataStarted = deferred<void>();
    const credential = vi.fn(async () => "sid1:proof");
    const sockets: FakeSocket[] = [];
    const controller = new AbortController();
    const client = {
      call: vi.fn(async (_plugin: string, method: string) => {
        if (method === "get_doorbell") {
          metadataStarted.resolve();
          return { result: await metadata.promise, eventId: "", eventHash: "" };
        }
        return { result: knowledgeResult([], 0), eventId: "", eventHash: "" };
      }),
    } as unknown as DoorClient;
    const feedPromise = startKnowledgeFeed({
      client,
      signal: controller.signal,
      credential,
      onKnowledge: () => {},
      socketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
    });
    await metadataStarted.promise;
    controller.abort();
    metadata.resolve({ owner_key: OWNER, topic: `opdbus/wake/${OWNER}`, listener: "wss://10.0.0.3:8084" });
    (await feedPromise).stop();
    expect(credential).not.toHaveBeenCalled();
    expect(sockets).toHaveLength(0);
  });

  it("releases a shared subscription after synchronous abort and a throwing status callback", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const credential = vi.fn(async () => "sid1:proof");
    const sockets: FakeSocket[] = [];
    const controller = new AbortController();
    const client = {
      call: vi.fn(async (_plugin: string, method: string) => ({
        result: method === "get_doorbell"
          ? { owner_key: OWNER, topic: `opdbus/wake/${OWNER}`, listener: "wss://10.0.0.3:8084" }
          : knowledgeResult([], 0),
        eventId: "",
        eventHash: "",
      })),
    } as unknown as DoorClient;
    const aborted = await startKnowledgeFeed({
      client,
      signal: controller.signal,
      credential,
      onKnowledge: () => {},
      onStatus: (status) => {
        if (status.state !== "connecting") return;
        controller.abort();
        throw new Error("status consumer failed");
      },
      socketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
    });
    aborted.stop();
    expect(credential).not.toHaveBeenCalled();
    expect(sockets).toHaveLength(0);

    const nextSockets: FakeSocket[] = [];
    const next = await startKnowledgeFeed({
      client,
      credential: async () => "sid1:next",
      onKnowledge: () => {},
      socketFactory: () => {
        const socket = new FakeSocket();
        nextSockets.push(socket);
        return socket;
      },
    });
    await vi.waitFor(() => expect(nextSockets).toHaveLength(1));
    next.stop();
    expect(nextSockets[0].closed).toBeTruthy();
  });
});
