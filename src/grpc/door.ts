/**
 * The :8090 door.
 *
 * Tonic serves gRPC + gRPC-Web on one TLS listener at https://10.0.0.2:8090.
 * The browser speaks gRPC-Web directly over TLS, or through the existing
 * same-origin connector on the canonical op-web page.
 * Every plugin operation goes through the one generic RPC
 * `operation.v1.PluginService/CallMethod`, carrying the plugin id, the method
 * name, the JSON arguments as a `google.protobuf.Value`, and the capability the
 * caller declares it is exercising. The bridge verifies that declaration against
 * the sealed schema's `required_capability`, authenticates the identity carried
 * in metadata, and only then dispatches onto D-Bus. Nothing decided in the
 * browser is trusted past this point.
 *
 * Identity is exactly one credential per request:
 *   - OIA1 — signed Oracle identity assertion, remote human
 *   - SID1 — server-authored sealed session id, locally registered human
 * Both are binary metadata (`-bin` suffix), so they travel base64-encoded.
 */
import { GrpcWebFetchTransport } from "@protobuf-ts/grpcweb-transport";
import type { JsonValue } from "@protobuf-ts/runtime";
import { RpcError } from "@protobuf-ts/runtime-rpc";
import { Value } from "./gen/google/protobuf/struct";
import { ErrorCode, type MutationError, type StateChange, type SubscribeRequest } from "./gen/operation";
import { PluginServiceClient, StateSyncClient } from "./gen/operation.client";

export const OIA1_HEADER = "x-oracle-identity-assertion-bin";
export const SID1_HEADER = "x-opdbus-sealed-id-bin";
export const IDENTITY_MODE_HEADER = "x-opdbus-identity-mode";
export const IDENTITY_SESSION_HEADER = "x-opdbus-identity-session";
const DECLARED_CAPABILITY_HEADER = "x-opdbus-capability";

/** Canonical plugin object root and interface (org.opdbus.v1). */
export const PLUGIN_OBJECT_ROOT = "/org/opdbus/v1/plugins";
export const PLUGIN_INTERFACE = "org.opdbus.v1.PluginV1";

export type DoorIdentity =
  | { kind: "oia1"; assertion: string }
  | { kind: "sid1"; sealedId: string };

export interface DoorConfig {
  /** Origin of the TLS door or the canonical page's same-origin connector. */
  url: string;
  identity: DoorIdentity;
  /** Default per-call deadline in milliseconds; a call may override it. */
  timeoutMs?: number;
  /** Receiver-confirmed bound Oracle mode; never sent as caller metadata. */
  boundOracle?: { sessionId: string; nextIdentity: () => Promise<DoorIdentity> };
  /** Cancels an entire connection attempt and its subsequent requests. */
  signal?: AbortSignal;
}

export interface CallEnvelope<T> {
  result: T;
  eventId: string;
  eventHash: string;
  identityBinding?: { mode: "bound-oracle"; sessionId: string };
}

/**
 * A door refusal or transport failure, surfaced from the status channel.
 * `code` is the gRPC status name (UNAUTHENTICATED, PERMISSION_DENIED, ...) or
 * the bridge's MutationError code when the RPC itself succeeded but dispatch
 * was refused.
 */
export class DoorError extends Error {
  readonly code: string;
  /** Exact gRPC status detail, retained for narrow protocol decisions. */
  readonly statusDetail?: string;
  constructor(code: string, message: string, statusDetail?: string) {
    super(message);
    this.name = "DoorError";
    this.code = code;
    this.statusDetail = statusDetail;
  }
}

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

function assertBase64(label: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length % 4 !== 0 || !BASE64_PATTERN.test(trimmed)) {
    throw new DoorError("INVALID_ARGUMENT", `${label} must be standard base64.`);
  }
  return trimmed;
}

export function identityMetadata(identity: DoorIdentity): Record<string, string> {
  switch (identity.kind) {
    case "oia1":
      return { [OIA1_HEADER]: assertBase64("OIA1 assertion", identity.assertion) };
    case "sid1":
      return { [SID1_HEADER]: assertBase64("SID1 sealed id", identity.sealedId) };
  }
}

/** Only these deployed HTTP pages expose the authenticated door connector. */
const PAGE_CONNECTOR_ORIGINS = new Set([
  "http://10.0.0.4:8080",
  "http://10.0.0.2:8080",
]);

function pageOrigin(): string {
  return typeof window === "undefined" ? "" : window.location.origin;
}

/** Use a connector only on the exact page origin that serves it. */
export function sameOriginDoorUrl(origin: string = pageOrigin()): string | undefined {
  return PAGE_CONNECTOR_ORIGINS.has(origin) ? origin : undefined;
}

export function normalizeDoorUrl(url: string): string {
  const trimmed = url.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new DoorError("INVALID_ARGUMENT", "Door URL must be an absolute origin.");
  }
  if (parsed.protocol !== "https:" &&
      !(parsed.protocol === "http:" && parsed.origin === sameOriginDoorUrl())) {
    throw new DoorError("INVALID_ARGUMENT", "Use an https door or this page's same-origin connector.");
  }
  // Check the raw shape too: URL parsing can collapse dot paths and backslashes.
  if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash ||
      !/^https?:\/\/[^\s/\\?#]+\/?$/i.test(trimmed)) {
    throw new DoorError("INVALID_ARGUMENT", "Door URL must be an origin with no credentials or path.");
  }
  return parsed.origin;
}

function mutationErrorCode(error: MutationError): string {
  const name = ErrorCode[error.code];
  return typeof name === "string" ? name : "UNSPECIFIED";
}

function userSafeMessage(code: string, detail: string): string {
  switch (code) {
    case "UNAUTHENTICATED":
      return "The door did not accept the identity credential.";
    case "PERMISSION_DENIED":
      return "This identity does not hold the capability for that operation.";
    case "UNAVAILABLE":
    case "DEADLINE_EXCEEDED":
      return "The door is not reachable right now.";
    default:
      return detail || `The door refused the call (${code}).`;
  }
}

export class DoorClient {
  readonly url: string;
  private readonly client: PluginServiceClient;
  private readonly stateClient: StateSyncClient;
  private readonly subscriptions = new Set<AbortController>();
  private meta: Record<string, string>;
  private readonly timeoutMs: number;
  private readonly boundOracle?: DoorConfig["boundOracle"];
  private readonly signal?: AbortSignal;
  private boundInvalid = false;

  constructor(config: DoorConfig) {
    this.url = normalizeDoorUrl(config.url);
    this.meta = identityMetadata(config.identity);
    this.timeoutMs = config.timeoutMs ?? 60_000;
    this.boundOracle = config.boundOracle;
    this.signal = config.signal;
    const transport = new GrpcWebFetchTransport({
      baseUrl: this.url,
      format: "binary",
      fetchInit: { credentials: "omit" },
    });
    this.client = new PluginServiceClient(transport);
    this.stateClient = new StateSyncClient(transport);
  }

  /**
   * Replace the credential carried on every subsequent call. Used when a
   * short-lived OIA1 assertion is renewed from the decoy before it expires;
   * the connection, catalog and chat state are untouched.
   */
  setIdentity(identity: DoorIdentity): void {
    if (this.boundOracle) throw new DoorError("UNAUTHENTICATED", "Reconnect to change a bound identity.");
    this.meta = identityMetadata(identity);
    for (const controller of this.subscriptions) controller.abort();
  }

  /** Local transport behavior established by receiver-confirmed bootstrap. */
  get isBoundOracle(): boolean { return this.boundOracle !== undefined; }

  /** Read committed SHM on the same lungs transport. Private selectors must
   * carry their exact declared read capability; the receiver admits the scope. */
  async subscribeState(
    request: SubscribeRequest,
    options: {
      signal: AbortSignal;
      capability?: string;
      onReady?: () => void;
      onFrame: (frame: StateChange) => void;
    },
  ): Promise<void> {
    // Assigned browser identities are admitted only on canonical method RPCs
    // (bridge interceptor::ghostbridge_interceptor_with_validator). StateSync
    // cannot return a verified binding for this mode. Do not consume a fresh
    // assertion or invalidate the shared method client for an unavailable feed.
    if (this.boundOracle) {
      throw new DoorError("UNIMPLEMENTED", "State updates are unavailable for this identity binding.");
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    const signals = [this.signal, options.signal].filter((signal): signal is AbortSignal => !!signal);
    signals.forEach(signal => signal.addEventListener("abort", abort, { once: true }));
    this.subscriptions.add(controller);
    try {
      if (signals.some(signal => signal.aborted) || this.boundInvalid) {
        throw new DoorError(this.boundInvalid ? "UNAUTHENTICATED" : "CANCELLED", "Reconnect to renew this connection.");
      }
      if (controller.signal.aborted) throw new DoorError("CANCELLED", "Subscription cancelled.");
      const meta = { ...this.meta };
      if (options.capability) meta[DECLARED_CAPABILITY_HEADER] = options.capability;
      const call = this.stateClient.subscribe(request, { meta, abort: controller.signal });
      const completion = Promise.all([call.status, call.trailers]);
      void completion.catch(() => {});
      this.validateBinding(await call.headers);
      if (controller.signal.aborted) throw new DoorError("CANCELLED", "Subscription cancelled.");
      options.onReady?.();
      for await (const frame of call.responses) {
        if (controller.signal.aborted) throw new DoorError("CANCELLED", "Subscription cancelled.");
        options.onFrame(frame);
      }
      await completion;
    } catch (error) {
      if (controller.signal.aborted) throw new DoorError("CANCELLED", "Subscription cancelled.");
      if (error instanceof DoorError) throw error;
      if (error instanceof RpcError) {
        const code = error.code === "INTERNAL" && /failed to fetch|fetch failed|networkerror/i.test(error.message) ? "UNAVAILABLE" : error.code;
        throw new DoorError(code, userSafeMessage(code, ""), error.message);
      }
      throw new DoorError("INTERNAL", "The state feed failed.", error instanceof Error ? error.message : undefined);
    } finally {
      controller.abort();
      this.subscriptions.delete(controller);
      signals.forEach(signal => signal.removeEventListener("abort", abort));
    }
  }

  private validateBinding(headers: Record<string, string | string[]> | undefined): void {
    const mode = headers?.[IDENTITY_MODE_HEADER];
    const session = headers?.[IDENTITY_SESSION_HEADER];
    let sessionId: string | undefined;
    if (mode !== undefined || session !== undefined) {
      if (mode !== "bound-oracle" || typeof session !== "string" || !session.trim()) {
        this.boundInvalid = !!this.boundOracle;
        throw new DoorError("UNAUTHENTICATED", "The door returned an invalid identity binding.");
      }
      sessionId = session;
    }
    if (this.boundOracle && sessionId !== this.boundOracle.sessionId) {
      this.boundInvalid = true;
      throw new DoorError("UNAUTHENTICATED", "The door's identity binding changed. Reconnect.");
    }
  }



  /**
   * Call one plugin method by name. `capability` is the method's declared
   * `required_capability` from the sealed schema; the bridge denies a call whose
   * declaration does not match. Returns the method's typed output unwrapped from
   * the bridge's audited envelope.
   */
  async call<T = unknown>(
    pluginId: string,
    method: string,
    args: Record<string, unknown>,
    capability: string,
    options: { timeoutMs?: number } = {},
  ): Promise<CallEnvelope<T>> {
    if (this.signal?.aborted) throw new DoorError("CANCELLED", "Connection cancelled.");
    // Local metadata per request: concurrent pickups cannot replace each
    // other's single-use assertion in the client's shared credential slot.
    if (this.boundInvalid) throw new DoorError("UNAUTHENTICATED", "Reconnect to renew this identity binding.");
    let meta;
    try {
      if (this.boundOracle) {
        const identity = await this.boundOracle.nextIdentity();
        if (identity.kind !== "oia1") throw new DoorError("UNAUTHENTICATED", "Bound identity requires an Oracle assertion.");
        meta = identityMetadata(identity);
      } else meta = { ...this.meta };
    } catch (error) {
      if (this.boundOracle) this.boundInvalid = true;
      throw error;
    }
    if (this.signal?.aborted) throw new DoorError("CANCELLED", "Connection cancelled.");
    let response;
    let headers;
    try {
      ({ response, headers } = await this.client.callMethod(
        {
          pluginId,
          objectPath: `${PLUGIN_OBJECT_ROOT}/${pluginId}`,
          interfaceName: PLUGIN_INTERFACE,
          methodName: method,
          arguments: [Value.fromJson(args as JsonValue)],
          actorId: "",
          capabilityId: capability,
        },
        {
          meta: { ...meta, [DECLARED_CAPABILITY_HEADER]: capability },
          timeout: options.timeoutMs ?? this.timeoutMs,
          abort: this.signal,
        },
      ));
    } catch (error) {
      if (error instanceof RpcError) {
        if (this.boundOracle && error.code === "UNAUTHENTICATED") this.boundInvalid = true;
        console.error("[door] rpc failed", { pluginId, method, code: error.code, detail: error.message });
        if (error.code === "INTERNAL" && /failed to fetch|fetch failed|networkerror/i.test(error.message)) {
          throw new DoorError("UNAVAILABLE", `Cannot reach the door at ${this.url}. Check your network connection and certificate trust.`, error.message);
        }
        throw new DoorError(error.code, userSafeMessage(error.code, ""), error.message);
      }
      console.error("[door] transport failed", { pluginId, method, error });
      throw new DoorError("UNAVAILABLE", userSafeMessage("UNAVAILABLE", ""));
    }

    if (this.signal?.aborted) throw new DoorError("CANCELLED", "Connection cancelled.");

    if (response.error) {
      const code = mutationErrorCode(response.error);
      console.error("[door] dispatch refused", { pluginId, method, code, detail: response.error.message });
      throw new DoorError(code, userSafeMessage(code, response.error.message));
    }
    const mode = headers?.[IDENTITY_MODE_HEADER];
    const session = headers?.[IDENTITY_SESSION_HEADER];
    let identityBinding: CallEnvelope<T>["identityBinding"];
    if (mode !== undefined || session !== undefined) {
      if (mode !== "bound-oracle" || typeof session !== "string" || !session.trim()) {
        if (this.boundOracle) this.boundInvalid = true;
        throw new DoorError("UNAUTHENTICATED", "The door returned an invalid identity binding.");
      }
      identityBinding = { mode, sessionId: session };
    }
    if (this.boundOracle && identityBinding?.sessionId !== this.boundOracle.sessionId) {
      this.boundInvalid = true;
      throw new DoorError("UNAUTHENTICATED", "The door's identity binding changed. Reconnect.");
    }

    if (!response.result) {
      throw new DoorError("INTERNAL", "The door returned no result.");
    }

    const envelope = Value.toJson(response.result);
    if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
      throw new DoorError("INTERNAL", "The door returned a malformed envelope.");
    }
    return {
      result: envelope.result as T,
      eventId: response.eventId,
      eventHash: response.eventHash,
      ...(identityBinding ? { identityBinding } : {}),
    };
  }
}

/**
 * Resolve the authenticated session, then read its existing sled credential.
 * OIA1 nonces are single-use: each bootstrap RPC gets a separate assertion.
 * Contracts verified with zcall help project get_context / identity_sled get_identity.
 */
export async function readSessionIdentity(
  config: DoorConfig,
  nextIdentity: () => Promise<DoorIdentity>,
): Promise<DoorIdentity> {
  const session = await readSessionConfig(config, nextIdentity);
  if (session.boundOracle) {
    throw new DoorError("UNAUTHENTICATED", "Bound identity requires fresh assertions for each call.");
  }
  return session.identity;
}

/** Keep the renewal provider only after the receiver confirms bound mode. */
export async function readSessionConfig(
  config: DoorConfig,
  nextIdentity: () => Promise<DoorIdentity>,
): Promise<DoorConfig> {
  if (config.identity.kind === "sid1") return config;
  const client = new DoorClient(config);
  const usedAssertions = new Set<string>([config.identity.assertion]);
  // Retain nonce identifiers only until expiry, never assertion credentials.
  let boundNonces: Map<string, number> | undefined;
  let registrationPubkey: string | undefined;
  let context: { session_id: string } | undefined;
  let identityBinding: CallEnvelope<unknown>["identityBinding"];
  try {
    ({ result: context, identityBinding } = await client.call<{ session_id: string }>(
      "project", "get_context", {}, "chat.context",
    ));
  } catch (error) {
    if (!(error instanceof DoorError) || error.code !== "UNAUTHENTICATED" || error.statusDetail !== "UnknownPrincipal") {
      throw error;
    }
    registrationPubkey = readOiaPublicKey(config.identity.assertion);
    const registrationIdentity = await nextFreshOia();
    client.setIdentity(registrationIdentity);
    await client.call(
      "human_principal",
      "register_key",
      { human_pubkey: registrationPubkey },
      "human_principal.write",
    );
    const contextIdentity = await nextFreshOia();
    client.setIdentity(contextIdentity);
    ({ result: context, identityBinding } = await client.call<{ session_id: string }>(
      "project", "get_context", {}, "chat.context",
    ));
  }

  async function nextFreshOia(): Promise<Extract<DoorIdentity, { kind: "oia1" }>> {
    if (config.signal?.aborted) throw new DoorError("CANCELLED", "Connection cancelled.");
    const identity = await nextIdentity();
    if (config.signal?.aborted) throw new DoorError("CANCELLED", "Connection cancelled.");
    if (identity.kind !== "oia1" || (!boundNonces && usedAssertions.has(identity.assertion))) {
      throw new DoorError("UNAUTHENTICATED", "A fresh identity assertion is required to read your session.");
    }
    // Decode every refreshed assertion in the bootstrap path and bind all
    // subsequent calls to the same public key.
    if (registrationPubkey && readOiaPublicKey(identity.assertion) !== registrationPubkey) {
      throw new DoorError("UNAUTHENTICATED", "The refreshed identity belongs to a different WireGuard key.");
    }
    if (boundNonces) {
      const frame = readOiaFrame(identity.assertion);
      const now = Date.now() / 1000;
      for (const [nonce, expiry] of boundNonces) if (expiry <= now) boundNonces.delete(nonce);
      if (frame.expiresAt <= now || boundNonces.has(frame.nonce) || boundNonces.size >= 4096) {
        throw new DoorError("UNAUTHENTICATED", "A fresh identity assertion is required. Retry to reconnect.");
      }
      boundNonces.set(frame.nonce, frame.expiresAt);
    } else usedAssertions.add(identity.assertion);
    return identity;
  }

  if (typeof context?.session_id !== "string" || !context.session_id.trim()) {
    throw new DoorError("INTERNAL", "The server did not identify your session.");
  }
  if (identityBinding) {
    if (identityBinding.sessionId !== context.session_id) {
      throw new DoorError("UNAUTHENTICATED", "The door returned a different bound session.");
    }
    registrationPubkey = readOiaPublicKey(config.identity.assertion);
    boundNonces = new Map([...usedAssertions].map(assertion => {
      const frame = readOiaFrame(assertion);
      return [frame.nonce, frame.expiresAt];
    }));
    usedAssertions.clear();
    return { ...config, boundOracle: { sessionId: context.session_id, nextIdentity: nextFreshOia } };
  }
  const sledIdentity = await nextFreshOia();
  client.setIdentity(sledIdentity);
  const { result } = await client.call<{ identity: { session_id: string; sealed_id: string } }>(
    "identity_sled", "get_identity", { session_id: context.session_id }, "identity_sled.read",
  );
  if (result?.identity?.session_id !== context.session_id) {
    throw new DoorError("UNAUTHENTICATED", "The server returned a different session.");
  }
  const inline = result.identity.sealed_id;
  if (typeof inline !== "string" || !/^sid1:[A-Za-z0-9_-]+$/.test(inline)) {
    throw new DoorError("UNAUTHENTICATED", "Your session has no server-issued credential.");
  }
  // Re-encode the authored bytes for gRPC-Web binary metadata; never mint or
  // reconstruct a credential from claims, keys, or session identifiers.
  try {
    const encoded = inline.slice(5).replace(/-/g, "+").replace(/_/g, "/");
    const wire = atob(encoded);
    if (!wire.startsWith("SID1")) throw new Error("invalid credential format");
    return { ...config, identity: { kind: "sid1", sealedId: btoa(wire) } };
  } catch {
    throw new DoorError("UNAUTHENTICATED", "The server returned an invalid session credential.");
  }
}

/** Extract the public key field from the documented OIA1 wire frame. This is
 * framing only; the bridge remains responsible for verifying its signature. */
function readOiaPublicKey(assertion: string): string {
  return readOiaFrame(assertion).publicKey;
}

function readOiaFrame(assertion: string): { publicKey: string; nonce: string; expiresAt: number } {
  try {
    const wire = decodeCanonicalBase64(assertion);
    const bytes = Uint8Array.from(wire, (char) => char.charCodeAt(0));
    if (bytes.length < 4 + 4 + 8 + 8 + 16 + 1 + 4 + 64 ||
        bytes[0] !== 0x4f || bytes[1] !== 0x49 || bytes[2] !== 0x41 || bytes[3] !== 0x31) {
      throw new Error("invalid OIA1 frame");
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 4;
    const readLength = (): number => {
      if (offset + 4 > bytes.length) throw new Error("truncated OIA1 length");
      const length = view.getUint32(offset, true);
      offset += 4;
      return length;
    };
    const readString = (): string => {
      const length = readLength();
      if (offset + length > bytes.length) throw new Error("truncated OIA1 string");
      const value = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(offset, offset + length));
      offset += length;
      return value;
    };
    const publicKey = readString();
    if (!isWireGuardPublicKey(publicKey)) throw new Error("invalid WireGuard public key");
    if (offset + 32 > bytes.length) throw new Error("truncated OIA1 lifetime");
    offset += 8; // issued_at; signature/freshness authority stays at the receiver.
    const expiresAt = Number(view.getBigUint64(offset, true));
    offset += 8;
    const nonce = Array.from(bytes.subarray(offset, offset + 16), byte => byte.toString(16).padStart(2, "0")).join("");
    offset += 16;
    if (offset >= bytes.length) throw new Error("truncated OIA1 address");
    const ipFamily = bytes[offset++];
    const ipLength = ipFamily === 4 ? 4 : ipFamily === 6 ? 16 : 0;
    if (!ipLength || offset + ipLength > bytes.length) throw new Error("invalid OIA1 address");
    offset += ipLength;
    readString(); // decoy key id
    if (offset + 64 !== bytes.length) throw new Error("invalid OIA1 signature framing");
    return { publicKey, nonce, expiresAt };
  } catch {
    throw new DoorError("UNAUTHENTICATED", "The identity assertion is malformed.");
  }
}

function isWireGuardPublicKey(value: string): boolean {
  try {
    return decodeCanonicalBase64(value).length === 32;
  } catch {
    return false;
  }
}

function decodeCanonicalBase64(value: string): string {
  const normalized = assertBase64("Base64 value", value);
  const decoded = atob(normalized);
  if (btoa(decoded) !== normalized) throw new Error("non-canonical base64");
  return decoded;
}
