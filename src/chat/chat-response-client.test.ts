import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  displayCommittedTurn,
  submitAndAwaitCommittedReply,
  waitForCommittedTurn,
} from "./chat-response-client";
import type { DoorClient } from "../grpc/door";
import type { WebSocketLike } from "./doorbell";

const submitted = { conversation_id: "conversation", turn_id: "turn", turn_index: 1 };
const owner = "ef".repeat(32);
const topic = `opdbus/wake/${owner}`;
const metadata = { owner_key: owner, topic, listener: "wss://door.test/mqtt" };
const committed = {
  ...submitted, response_id: "resp-1",
  content: { kind: "user_response", message: "committed" },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

class BrokerSocket implements WebSocketLike {
  static sockets: BrokerSocket[] = [];
  binaryType = "blob";
  readyState = 0;
  onopen: WebSocketLike["onopen"] = null;
  onmessage: WebSocketLike["onmessage"] = null;
  onclose: WebSocketLike["onclose"] = null;
  onerror: WebSocketLike["onerror"] = null;
  sent: Uint8Array[] = [];
  closed = false;
  constructor() { BrokerSocket.sockets.push(this); }
  send(data: ArrayBuffer | Uint8Array) { this.sent.push(new Uint8Array(data)); }
  close() { this.closed = true; }
  async deliver(bytes: number[]) {
    await this.onmessage?.({ data: Uint8Array.from(bytes).buffer });
  }
  async subscribe() {
    this.onopen?.({});
    await this.deliver([0x20, 2, 0, 0]);
    await this.deliver([0x90, 3, 0, 1, 1]);
  }
  async wake(seq: number) {
    const name = [...new TextEncoder().encode(topic)];
    const payload = [...new TextEncoder().encode(JSON.stringify({ seq }))];
    const body = [0, name.length, ...name, ...payload];
    await this.deliver([0x30, body.length, ...body]);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  BrokerSocket.sockets = [];
  vi.stubGlobal("WebSocket", BrokerSocket);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function client(handlers: Record<string, (args: unknown) => unknown>): DoorClient {
  return {
    call: vi.fn(async (plugin: string, method: string, args: unknown) => {
      expect(plugin).toBe("chat_response");
      const handler = handlers[method];
      if (!handler) throw new Error(`unexpected ${method}`);
      return { result: await handler(args), eventId: "1", eventHash: `hash-${method}` };
    }),
  } as unknown as DoorClient;
}

describe("chat-response-client", () => {
  it("recovers a commit made after the first read but before SUBACK", async () => {
    let turn: typeof committed | null = null;
    let reads = 0;
    const preSubscriptionReadDone = deferred<void>();
    const submit = vi.fn(() => submitted);
    const door = client({
      start_conversation: () => ({ conversation_id: submitted.conversation_id }),
      submit_turn: submit,
      get_turn_response: () => {
        reads += 1;
        if (reads === 2) preSubscriptionReadDone.resolve();
        return { turn };
      },
      get_doorbell: () => metadata,
    });
    const credential = vi.fn(async () => "sid1:proof");
    const reply = submitAndAwaitCommittedReply(door, null, "hi", "text", 5_000, { credential });
    await preSubscriptionReadDone.promise;
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(BrokerSocket.sockets).toHaveLength(1));
    turn = committed; // No PUBLISH: the subscription gap must be reconciled.
    await BrokerSocket.sockets[0].subscribe();
    const result = await reply;
    expect(result.conversationId).toBe(submitted.conversation_id);
    expect(result.response.message.content).toBe("committed");
    expect(submit).toHaveBeenCalledOnce();
    expect(BrokerSocket.sockets[0].closed).toBe(true);
  });

  it("coalesces a wake that arrives during the SUBACK-triggered read", async () => {
    const pendingRead = deferred<{ turn: typeof committed | null }>();
    const firstReadDone = deferred<void>();
    const preSubscribeReadDone = deferred<void>();
    const subackReadStarted = deferred<void>();
    let reads = 0;
    let slow = false;
    let turn: typeof committed | null = null;
    const door = client({
      get_turn_response: () => {
        reads += 1;
        if (reads === 1) {
          firstReadDone.resolve();
          return { turn: null };
        }
        if (reads === 2) {
          preSubscribeReadDone.resolve();
          return { turn: null };
        }
        if (slow) {
          subackReadStarted.resolve();
          return pendingRead.promise;
        }
        return { turn };
      },
      get_doorbell: () => metadata,
    });
    const reply = waitForCommittedTurn(door, submitted, 5_000, undefined, async () => "sid1:proof");
    await firstReadDone.promise;
    await preSubscribeReadDone.promise;
    await vi.waitFor(() => expect(BrokerSocket.sockets).toHaveLength(1));
    slow = true;
    const ws = BrokerSocket.sockets[0];
    await ws.subscribe();
    await subackReadStarted.promise;
    turn = committed;
    await ws.wake(1);
    slow = false;
    pendingRead.resolve({ turn: null });
    expect((await reply).response_id).toBe("resp-1");
  });

  it("rejects a different conversation even when its turn id and index match", async () => {
    const door = client({
      get_turn_response: () => ({ turn: { ...committed, conversation_id: "other" } }),
    });
    await expect(
      waitForCommittedTurn(door, submitted, 1_000, undefined, async () => "sid1:proof"),
    ).rejects.toThrow("does not match");
    expect(BrokerSocket.sockets).toHaveLength(0);
  });

  it("does not poll or resubmit while awaiting a wake", async () => {
    const read = vi.fn(() => ({ turn: null }));
    const submit = vi.fn(() => submitted);
    const door = client({
      submit_turn: submit, get_turn_response: read, get_doorbell: () => metadata,
    });
    const controller = new AbortController();
    const reply = submitAndAwaitCommittedReply(door, submitted.conversation_id, "hi", "text", 300_000,
      { signal: controller.signal, credential: async () => "sid1:proof" });
    const rejected = expect(reply).rejects.toThrow("outcome is unknown");
    await vi.advanceTimersByTimeAsync(0);
    await BrokerSocket.sockets[0].subscribe();
    await vi.advanceTimersByTimeAsync(0);
    const readsBeforeIdle = read.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(read).toHaveBeenCalledTimes(readsBeforeIdle);
    expect(submit).toHaveBeenCalledOnce();
    controller.abort();
    await rejected;
    expect(BrokerSocket.sockets[0].closed).toBe(true);
  });

  it("cancels during a pending first read without later metadata, proof or socket setup", async () => {
    const first = deferred<{ turn: null }>();
    const discover = vi.fn(() => metadata);
    const credential = vi.fn(async () => "sid1:proof");
    const door = client({ get_turn_response: () => first.promise, get_doorbell: discover });
    const controller = new AbortController();
    const reply = waitForCommittedTurn(door, submitted, 5_000, controller.signal, credential);
    const rejected = expect(reply).rejects.toThrow("outcome is unknown");
    controller.abort();
    await rejected;
    first.resolve({ turn: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(discover).not.toHaveBeenCalled();
    expect(credential).not.toHaveBeenCalled();
    expect(BrokerSocket.sockets).toHaveLength(0);
  });

  it("discards pending metadata after the identity scope is aborted", async () => {
    const lookup = deferred<typeof metadata>();
    const credential = vi.fn(async () => "sid1:replacement");
    const discover = vi.fn(() => lookup.promise);
    const door = client({ get_turn_response: () => ({ turn: null }), get_doorbell: discover });
    const controller = new AbortController();
    const reply = waitForCommittedTurn(door, submitted, 5_000, controller.signal, credential);
    const rejected = expect(reply).rejects.toThrow("outcome is unknown");
    await vi.advanceTimersByTimeAsync(0);
    expect(discover).toHaveBeenCalledOnce();
    controller.abort();
    await rejected;
    lookup.resolve(metadata);
    await vi.advanceTimersByTimeAsync(0);
    expect(credential).not.toHaveBeenCalled();
    expect(BrokerSocket.sockets).toHaveLength(0);
  });

  it("formats clarification and refusal commits for display", async () => {
    const door = client({});
    const clarification = await displayCommittedTurn(door, {
      response_id: "c1",
      content: { kind: "clarification", question: "Which host?", options: ["a", "b"] },
    });
    expect(clarification.message.content).toContain("Which host?");
    expect(clarification.message.content).toContain("• a");

    const refusal = await displayCommittedTurn(door, {
      response_id: "r1",
      content: { kind: "refusal", reason: "Not allowed", alternatives: ["ask differently"] },
    });
    expect(refusal.message.content).toContain("Not allowed");
    expect(refusal.message.content).toContain("ask differently");
  });
});
