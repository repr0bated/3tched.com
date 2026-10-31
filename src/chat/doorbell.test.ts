import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decodePackets,
  decodePublish,
  doorbellPassword,
  encodeConnect,
  encodeSubscribe,
  ringDoorbell,
  wakeSequence,
  type WebSocketLike,
} from "./doorbell";

afterEach(() => vi.restoreAllMocks());

const OWNER = "ab".repeat(32);
const TOPIC = `opdbus/wake/${OWNER}`;

class FakeSocket implements WebSocketLike {
  binaryType = "blob";
  readyState = 0;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: ArrayBuffer | Blob | string }) => void) | null = null;
  onclose: ((ev: { code?: number; reason?: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  sent: Uint8Array[] = [];
  closed: string[] = [];
  send(data: ArrayBuffer | Uint8Array) {
    this.sent.push(data instanceof Uint8Array ? data : new Uint8Array(data));
  }
  close(_code?: number, reason?: string) {
    this.closed.push(reason ?? "");
  }
  // Broker side.
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  async deliver(bytes: Uint8Array) {
    const copy = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(copy).set(bytes);
    await this.onmessage?.({ data: copy });
  }
}

const connack = (code: number) => Uint8Array.from([0x20, 2, 0, code]);
const suback = (granted: number) => Uint8Array.from([0x90, 3, 0, 1, granted]);
function publish(topic: string, payload: string, qos = 1, packetId = 7): Uint8Array {
  const t = new TextEncoder().encode(topic);
  const p = new TextEncoder().encode(payload);
  const body = [t.length >> 8, t.length & 0xff, ...t, ...(qos ? [packetId >> 8, packetId & 0xff] : []), ...p];
  return Uint8Array.from([0x30 | (qos << 1), body.length, ...body]);
}

describe("doorbell codec", () => {
  it("encodes a clean-session CONNECT whose client id is the owner key and password the credential", () => {
    const bytes = encodeConnect(OWNER, "oia1:QUJDRA==", 60);
    expect(bytes[0]).toBe(0x10);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("MQTT");
    expect(text).toContain(OWNER);
    expect(text).toContain("oia1:QUJDRA==");
    // flags follow the protocol name and level: username + password + clean session
    const level = text.indexOf("MQTT") + 4;
    expect(bytes[level]).toBe(4);
    expect(bytes[level + 1]).toBe(0b1100_0010);
  });

  it("splits a stream into packets and keeps the unread tail", () => {
    const joined = new Uint8Array([...connack(0), ...suback(1), 0x30]);
    const { packets, rest } = decodePackets(joined);
    expect(packets.map((p) => p.type)).toEqual([2, 9]);
    expect(rest).toEqual(new Uint8Array([0x30]));
  });

  it("decodes a QoS1 publish and only accepts {seq} payloads", () => {
    const p = decodePackets(publish(TOPIC, '{"seq":42}')).packets[0];
    const decoded = decodePublish(p.flags, p.body);
    expect(decoded).toEqual({ topic: TOPIC, qos: 1, packetId: 7, payload: '{"seq":42}' });
    expect(wakeSequence('{"seq":42}')).toBe(42);
    expect(wakeSequence('{"knowledge":"leak"}')).toBeNull();
    expect(wakeSequence("nope")).toBeNull();
  });

  it("subscribes at QoS1 to exactly one topic", () => {
    const bytes = encodeSubscribe(1, TOPIC);
    expect(bytes[0]).toBe(0x82);
    expect(new TextDecoder().decode(bytes)).toContain(TOPIC);
    expect(bytes[bytes.length - 1]).toBe(1);
  });

  it("turns the door credential into the doorbell password form", () => {
    expect(doorbellPassword({ kind: "oia1", assertion: "QUJDRA==" })).toBe("oia1:QUJDRA==");
    expect(doorbellPassword({ kind: "sid1", sealedId: "QUJD+/==" })).toBe("sid1:QUJD-_");
  });
});

describe("ringDoorbell", () => {
  it("connects with a fresh credential, subscribes at QoS1, acknowledges publishes, and releases", async () => {
    const sockets: FakeSocket[] = [];
    let issued = 0;
    const credential = vi.fn(async () => `oia1:${++issued}`);
    const statuses: string[] = [];
    const bell = ringDoorbell({
      listener: "wss://10.0.0.3:8084",
      ownerKey: OWNER,
      topic: TOPIC,
      credential,
      onWake: () => {},
      onStatus: (s) => statuses.push(s.state),
      socketFactory: () => {
        const s = new FakeSocket();
        sockets.push(s);
        return s;
      },
    });
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    const ws = sockets[0];
    ws.open();
    expect(ws.sent[0][0]).toBe(0x10);
    expect(new TextDecoder().decode(ws.sent[0])).toContain("oia1:1");
    await ws.deliver(connack(0));
    expect(ws.sent[1][0]).toBe(0x82);
    await ws.deliver(suback(1));
    expect(statuses).toEqual(["connecting", "subscribed"]);

    await ws.deliver(publish(TOPIC, '{"seq":5}'));
    await ws.deliver(publish(TOPIC, '{"seq":5}', 1, 8));
    await ws.deliver(publish("opdbus/wake/other", '{"seq":9}'));
    expect(ws.sent.filter((b) => b[0] === 0x40)).toHaveLength(3);

    bell.stop();
    expect(ws.closed).toEqual(["stopped"]);
    expect(statuses.at(-1)).toBe("closed");
  });

  it("shares one socket, preserves independent readers, and releases only after the last stop", async () => {
    const sockets: FakeSocket[] = [];
    const make = (onWake: () => void, onStatus?: (state: string) => void) => ringDoorbell({
      listener: "wss://10.0.0.3:8084",
      ownerKey: OWNER,
      topic: TOPIC,
      credential: async () => "sid1:proof",
      onWake,
      onStatus: (status) => onStatus?.(status.state),
      socketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let stateA = "a-before";
    let stateB = "b-before";
    const seenA: string[] = [];
    const seenB: string[] = [];
    const first = make(() => seenA.push(stateA), () => { throw new Error("consumer status failure"); });
    const second = make(() => seenB.push(stateB));
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    const ws = sockets[0];
    ws.open();
    await ws.deliver(connack(0));
    await ws.deliver(suback(1));

    stateA = "a-committed";
    stateB = "b-committed";
    await ws.deliver(publish(TOPIC, '{"seq":4}', 0));
    stateA = "a-later";
    stateB = "b-later";
    await ws.deliver(publish(TOPIC, '{"seq":4}', 0));
    await ws.deliver(publish(TOPIC, '{"seq":3}', 0));
    expect(seenA).toEqual(["a-committed", "a-later", "a-later"]);
    expect(seenB).toEqual(["b-committed", "b-later", "b-later"]);

    first.stop();
    expect(ws.closed).toHaveLength(0);
    stateA = "must-not-deliver";
    stateB = "b-still-live";
    await ws.deliver(publish(TOPIC, '{"seq":3}', 0));
    expect(seenA).not.toContain("must-not-deliver");
    expect(seenB.at(-1)).toBe("b-still-live");
    second.stop();
    expect(ws.closed).toEqual(["stopped"]);
  });

  it("retries with a new credential when the broker refuses the connect", async () => {
    vi.useFakeTimers();
    try {
      const sockets: FakeSocket[] = [];
      let issued = 0;
      const credential = vi.fn(async () => `oia1:${++issued}`);
      const statuses: Array<{ state: string; reason?: string }> = [];
      const bell = ringDoorbell({
        listener: "wss://10.0.0.3:8084",
        ownerKey: OWNER,
        topic: TOPIC,
        credential,
        onWake: () => {},
        onStatus: (s) => statuses.push(s.state === "closed" ? { state: s.state, reason: s.reason } : { state: s.state }),
        socketFactory: () => {
          const s = new FakeSocket();
          sockets.push(s);
          return s;
        },
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(sockets).toHaveLength(1);
      sockets[0].open();
      await sockets[0].deliver(connack(5));
      expect(statuses.at(-1)).toEqual({ state: "closed", reason: "connect refused: not authorized" });
      await vi.advanceTimersByTimeAsync(2_100);
      expect(sockets).toHaveLength(2);
      expect(credential).toHaveBeenCalledTimes(2);
      sockets[1].open();
      const second = new TextDecoder().decode(sockets[1].sent[0]);
      expect(second).toContain("oia1:2");
      expect(second).not.toContain("oia1:1");
      bell.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
