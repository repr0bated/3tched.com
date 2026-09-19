import { describe, expect, it, vi } from "vitest";
import type { DoorClient } from "../grpc/door";
import { startKnowledgeFeed, type KnowledgePush } from "./knowledge-feed";
import type { WebSocketLike } from "./doorbell";

const OWNER = "cd".repeat(32);

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
  send(data: ArrayBuffer | Uint8Array) {
    this.sent.push(data instanceof Uint8Array ? data : new Uint8Array(data));
  }
  close() {}
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

describe("knowledge feed", () => {
  it("reads through the door first, then re-reads only on a newer wake and reports only new pushes", async () => {
    let window: KnowledgePush[] = [push("00000000000000000002")];
    let revision = 2;
    const calls: string[] = [];
    const client = {
      call: vi.fn(async (_plugin: string, method: string) => {
        calls.push(method);
        if (method === "get_doorbell") {
          return { result: { owner_key: OWNER, topic: `opdbus/wake/${OWNER}`, listener: "wss://10.0.0.3:8084" }, eventId: "", eventHash: "" };
        }
        return {
          result: { knowledge: window, knowledge_count: window.length, episode_revision: revision, knowledge_truncated: false },
          eventId: "",
          eventHash: "",
        };
      }),
    } as unknown as DoorClient;
    const sockets: FakeSocket[] = [];
    const onKnowledge = vi.fn();
    const feed = await startKnowledgeFeed({
      client,
      identity: () => ({ kind: "oia1", assertion: "QUJDRA==" }),
      onKnowledge,
      socketFactory: () => {
        const s = new FakeSocket();
        sockets.push(s);
        return s;
      },
    });
    expect(onKnowledge).toHaveBeenCalledTimes(1);
    expect(onKnowledge.mock.calls[0][0].map((p: KnowledgePush) => p.push_id)).toEqual(["00000000000000000002"]);
    expect(calls).toEqual(["list_knowledge", "get_doorbell"]);

    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    const ws = sockets[0];
    ws.readyState = 1;
    ws.onopen?.({});
    expect(new TextDecoder().decode(ws.sent[0])).toContain("oia1:QUJDRA==");
    await ws.deliver([0x20, 2, 0, 0]);
    await ws.deliver([0x90, 3, 0, 1, 1]);
    // Subscribing re-reads once (a reconnect may have missed wakes): nothing new.
    await vi.waitFor(() => expect(calls.filter((c) => c === "list_knowledge")).toHaveLength(2));
    expect(onKnowledge).toHaveBeenCalledTimes(1);

    // A stale wake is ignored; a newer one re-reads and yields only the new push.
    await ws.deliver(wake(`opdbus/wake/${OWNER}`, 2));
    expect(calls.filter((c) => c === "list_knowledge")).toHaveLength(2);
    window = [push("00000000000000000003"), ...window];
    revision = 3;
    await ws.deliver(wake(`opdbus/wake/${OWNER}`, 3));
    await vi.waitFor(() => expect(onKnowledge).toHaveBeenCalledTimes(2));
    expect(onKnowledge.mock.calls[1][0].map((p: KnowledgePush) => p.push_id)).toEqual(["00000000000000000003"]);
    expect(onKnowledge.mock.calls[1][1]).toBe(3);
    feed.stop();
  });
});
