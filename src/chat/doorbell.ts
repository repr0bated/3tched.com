/**
 * The doorbell: a content-free wake from the broker, gated by the identity
 * sled, telling this page to re-read its private state through the door.
 *
 * What the broker sees: an MQTT client whose id is the page's owner key
 * (`sha256(principal, session, genesis)`, handed out by the door), a password
 * that is the page's own door credential (`oia1:<base64>` or `sid1:…`), one
 * SUBSCRIBE to `opdbus/wake/<owner-key>`, and `{"seq": n}` messages. Nothing
 * authoritative and no identity ever transits the broker; the door verifies
 * the credential against the sled exactly as it does for a gRPC call.
 *
 * This is a deliberately minimal MQTT 3.1.1 client (CONNECT, SUBSCRIBE,
 * PUBLISH in, PINGREQ, DISCONNECT) over a WebSocket — about the size of a
 * dependency's type definitions, and fully testable with a fake socket.
 */

export interface DoorbellConfig {
  /** wss://host:port */
  listener: string;
  /** Owner key; doubles as the MQTT client id. */
  ownerKey: string;
  /** Exactly the topic the door said; the broker refuses anything else. */
  topic: string;
  /**
   * A fresh credential for each CONNECT. An issued OIA1 is one-time (the
   * door consumes its nonce), so a reconnect must not reuse the last one.
   */
  credential: () => Promise<string>;
  onWake: (seq: number) => void;
  onStatus?: (status: DoorbellStatus) => void;
  /** Keepalive in seconds (MQTT). */
  keepAliveSeconds?: number;
  /** Test seam. */
  socketFactory?: (url: string) => WebSocketLike;
}

export type DoorbellStatus =
  | { state: "connecting" }
  | { state: "subscribed" }
  | { state: "closed"; reason: string; retryInMs: number | null };

export interface WebSocketLike {
  binaryType: string;
  readyState: number;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: ArrayBuffer | Blob | string }) => void) | null;
  onclose: ((ev: { code?: number; reason?: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  send(data: ArrayBuffer | Uint8Array): void;
  close(code?: number, reason?: string): void;
}

export interface Doorbell {
  stop(): void;
}

const CONNECT = 1, CONNACK = 2, PUBLISH = 3, PUBACK = 4, SUBSCRIBE = 8, SUBACK = 9;
const PINGREQ = 12, PINGRESP = 13, DISCONNECT = 14;
const MIN_RETRY_MS = 2_000;
const MAX_RETRY_MS = 60_000;
const CONNACK_REFUSED = ["accepted", "unacceptable protocol", "identifier rejected", "server unavailable", "bad credentials", "not authorized"];

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function remainingLength(length: number): number[] {
  const out: number[] = [];
  do {
    let digit = length % 128;
    length = Math.floor(length / 128);
    if (length > 0) digit |= 0x80;
    out.push(digit);
  } while (length > 0);
  return out;
}

function utf8Field(text: string): number[] {
  const bytes = encoder.encode(text);
  if (bytes.length > 0xffff) throw new Error("MQTT string too long");
  return [bytes.length >> 8, bytes.length & 0xff, ...bytes];
}

function packet(type: number, flags: number, body: number[]): Uint8Array {
  return Uint8Array.from([(type << 4) | flags, ...remainingLength(body.length), ...body]);
}

/** MQTT 3.1.1 CONNECT: clean session, username = client id, password = credential. */
export function encodeConnect(clientId: string, password: string, keepAliveSeconds: number): Uint8Array {
  const flags = 0b1100_0010; // username, password, clean session
  const body = [
    ...utf8Field("MQTT"),
    4,
    flags,
    keepAliveSeconds >> 8,
    keepAliveSeconds & 0xff,
    ...utf8Field(clientId),
    ...utf8Field(clientId),
    ...utf8Field(password),
  ];
  return packet(CONNECT, 0, body);
}

export function encodeSubscribe(packetId: number, topic: string): Uint8Array {
  return packet(SUBSCRIBE, 0b0010, [packetId >> 8, packetId & 0xff, ...utf8Field(topic), 1]);
}

export function encodePuback(packetId: number): Uint8Array {
  return packet(PUBACK, 0, [packetId >> 8, packetId & 0xff]);
}

export const PINGREQ_PACKET = packet(PINGREQ, 0, []);
export const DISCONNECT_PACKET = packet(DISCONNECT, 0, []);

export interface DecodedPacket {
  type: number;
  flags: number;
  body: Uint8Array;
}

/** Split a byte buffer into complete packets; returns the unread tail. */
export function decodePackets(buffer: Uint8Array): { packets: DecodedPacket[]; rest: Uint8Array } {
  // (slices below share `buffer`'s storage; callers copy when they join)
  const packets: DecodedPacket[] = [];
  let offset = 0;
  while (offset < buffer.length) {
    const first = buffer[offset];
    let multiplier = 1;
    let length = 0;
    let i = offset + 1;
    let digit: number;
    do {
      if (i >= buffer.length) return { packets, rest: buffer.slice(offset) };
      digit = buffer[i++];
      length += (digit & 0x7f) * multiplier;
      multiplier *= 128;
      if (multiplier > 128 * 128 * 128 * 128) throw new Error("malformed MQTT length");
    } while (digit & 0x80);
    if (i + length > buffer.length) return { packets, rest: buffer.slice(offset) };
    packets.push({ type: first >> 4, flags: first & 0x0f, body: buffer.slice(i, i + length) });
    offset = i + length;
  }
  return { packets, rest: new Uint8Array(0) };
}

export interface IncomingPublish {
  topic: string;
  qos: number;
  packetId: number | null;
  payload: string;
}

export function decodePublish(flags: number, body: Uint8Array): IncomingPublish {
  const qos = (flags >> 1) & 0b11;
  const topicLength = (body[0] << 8) | body[1];
  const topic = decoder.decode(body.slice(2, 2 + topicLength));
  let offset = 2 + topicLength;
  let packetId: number | null = null;
  if (qos > 0) {
    packetId = (body[offset] << 8) | body[offset + 1];
    offset += 2;
  }
  return { topic, qos, packetId, payload: decoder.decode(body.slice(offset)) };
}

/** `{"seq": n}` → n; anything else is not a wake. */
export function wakeSequence(payload: string): number | null {
  try {
    const parsed = JSON.parse(payload) as { seq?: unknown };
    return typeof parsed?.seq === "number" && Number.isFinite(parsed.seq) ? parsed.seq : null;
  } catch {
    return null;
  }
}

async function toBytes(data: ArrayBuffer | Blob | string): Promise<Uint8Array> {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (typeof data === "string") return encoder.encode(data);
  return new Uint8Array(await data.arrayBuffer());
}
interface SharedDoorbellListener {
  config: DoorbellConfig;
  active: boolean;
}

interface SharedDoorbellEntry {
  listener: string;
  topic: string;
  listeners: Set<SharedDoorbellListener>;
  doorbell: Doorbell;
  status: DoorbellStatus;
}

const sharedDoorbells = new Map<string, SharedDoorbellEntry>();

/** One MQTT client ID owns one socket; readers receive independent wake hints. */
export function subscribeDoorbell(config: DoorbellConfig): Doorbell {
  let entry = sharedDoorbells.get(config.ownerKey);
  if (entry && (entry.listener !== config.listener || entry.topic !== config.topic)) {
    throw new Error("The owner-key doorbell is already bound to a different listener or topic.");
  }

  const listener: SharedDoorbellListener = { config, active: true };
  if (!entry) {
    const listeners = new Set<SharedDoorbellListener>([listener]);
    const created: SharedDoorbellEntry = {
      listener: config.listener,
      topic: config.topic,
      listeners,
      status: { state: "connecting" },
      doorbell: { stop() {} },
    };
    created.doorbell = startDoorbell({
      ...config,
      credential: async () => {
        for (const item of created.listeners) {
          if (item.active) return item.config.credential();
        }
        throw new Error("No active owner-key doorbell subscriber.");
      },
      onWake: (seq) => {
        for (const item of created.listeners) {
          if (!item.active) continue;
          try {
            item.config.onWake(seq);
          } catch (error) {
            console.warn("[doorbell] wake callback failed", error);
          }
        }
      },
      onStatus: (status) => {
        created.status = status;
        for (const item of created.listeners) {
          if (!item.active) continue;
          try {
            item.config.onStatus?.(status);
          } catch (error) {
            console.warn("[doorbell] status callback failed", error);
          }
        }
      },
    });
    entry = created;
    sharedDoorbells.set(config.ownerKey, entry);
  } else {
    entry.listeners.add(listener);
    try {
      listener.config.onStatus?.(entry.status);
    } catch (error) {
      console.warn("[doorbell] status callback failed", error);
    }
  }

  const ownedEntry = entry;
  return {
    stop() {
      if (!listener.active) return;
      listener.active = false;
      ownedEntry.listeners.delete(listener);
      if (ownedEntry.listeners.size === 0) {
        sharedDoorbells.delete(config.ownerKey);
        ownedEntry.doorbell.stop();
      }
    },
  };
}
/** Public entry point; all owner-key callers share the refcounted socket. */
export function ringDoorbell(config: DoorbellConfig): Doorbell {
  return subscribeDoorbell(config);
}


/**
 * Connect, subscribe, and call `onWake` for every `{"seq"}` on the topic.
 * Reconnects with backoff (fresh credential each time) until `stop()`.
 */
function startDoorbell(config: DoorbellConfig): Doorbell {
  const keepAlive = config.keepAliveSeconds ?? 60;
  const factory = config.socketFactory ?? ((url: string) => new WebSocket(url, "mqtt") as unknown as WebSocketLike);
  let stopped = false;
  let attempt = 0;
  let socket: WebSocketLike | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let pingTimer: ReturnType<typeof setInterval> | undefined;

  const status = (next: DoorbellStatus) => config.onStatus?.(next);

  const closeSocket = (reason: string) => {
    if (pingTimer !== undefined) clearInterval(pingTimer);
    pingTimer = undefined;
    const current = socket;
    socket = null;
    if (current) {
      current.onmessage = null;
      current.onopen = null;
      current.onclose = null;
      current.onerror = null;
      try {
        current.send(DISCONNECT_PACKET);
      } catch {
        // already gone
      }
      try {
        current.close(1000, reason);
      } catch {
        // already gone
      }
    }
  };

  const scheduleRetry = (reason: string) => {
    if (stopped) return;
    attempt += 1;
    const delay = Math.min(MAX_RETRY_MS, MIN_RETRY_MS * 2 ** Math.min(attempt - 1, 5));
    status({ state: "closed", reason, retryInMs: delay });
    retryTimer = setTimeout(() => void connect(), delay);
  };

  const connect = async () => {
    if (stopped) return;
    status({ state: "connecting" });
    let credential: string;
    try {
      credential = await config.credential();
    } catch (error) {
      scheduleRetry(error instanceof Error ? error.message : "no credential");
      return;
    }
    if (stopped) return;
    let pending: Uint8Array = new Uint8Array(0);
    let ws: WebSocketLike;
    try {
      ws = factory(config.listener);
    } catch (error) {
      scheduleRetry(error instanceof Error ? error.message : "socket failed");
      return;
    }
    socket = ws;
    ws.binaryType = "arraybuffer";
    ws.onopen = () => {
      ws.onopen = null;
      ws.send(encodeConnect(config.ownerKey, credential, keepAlive));
    };
    ws.onerror = () => {
      /* onclose follows */
    };
    ws.onclose = (ev) => {
      if (socket !== ws) return;
      closeSocket("closed");
      scheduleRetry(ev?.reason || `socket closed (${ev?.code ?? "?"})`);
    };
    ws.onmessage = async (ev) => {
      if (socket !== ws) return;
      const chunk = await toBytes(ev.data);
      if (socket !== ws) return;
      const joined = new Uint8Array(pending.length + chunk.length);
      joined.set(pending);
      joined.set(chunk, pending.length);
      let decoded: ReturnType<typeof decodePackets>;
      try {
        decoded = decodePackets(joined);
      } catch (error) {
        closeSocket("malformed");
        scheduleRetry(error instanceof Error ? error.message : "malformed packet");
        return;
      }
      pending = Uint8Array.from(decoded.rest);
      for (const p of decoded.packets) {
        switch (p.type) {
          case CONNACK: {
            const code = p.body[1] ?? 0xff;
            if (code !== 0) {
              closeSocket("refused");
              scheduleRetry(`connect refused: ${CONNACK_REFUSED[code] ?? code}`);
              return;
            }
            ws.send(encodeSubscribe(1, config.topic));
            break;
          }
          case SUBACK: {
            const granted = p.body[2] ?? 0x80;
            if (granted === 0x80) {
              closeSocket("subscribe refused");
              scheduleRetry("subscribe refused");
              return;
            }
            attempt = 0;
            status({ state: "subscribed" });
            pingTimer = setInterval(() => {
              try {
                ws.send(PINGREQ_PACKET);
              } catch {
                // closing
              }
            }, Math.max(5, keepAlive - 10) * 1000);
            break;
          }
          case PUBLISH: {
            const publish = decodePublish(p.flags, p.body);
            if (publish.qos > 0 && publish.packetId !== null) ws.send(encodePuback(publish.packetId));
            if (publish.topic !== config.topic) break;
            const seq = wakeSequence(publish.payload);
            if (seq !== null) config.onWake(seq);
            break;
          }
          case PINGRESP:
          case PUBACK:
            break;
          default:
            break;
        }
      }
    };
  };

  void connect();

  return {
    stop() {
      stopped = true;
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      closeSocket("stopped");
      status({ state: "closed", reason: "stopped", retryInMs: null });
    },
  };
}

/** The door credential in the form the doorbell password expects. */
export function doorbellPassword(identity: { kind: "oia1"; assertion: string } | { kind: "sid1"; sealedId: string }): string {
  if (identity.kind === "oia1") return `oia1:${identity.assertion}`;
  // SID1 travels to the door as base64 of the wire; its inline form is
  // `sid1:` + base64url without padding of the same bytes.
  const url = identity.sealedId.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return url.startsWith("sid1:") ? url : `sid1:${url}`;
}
