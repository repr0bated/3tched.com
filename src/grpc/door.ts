/**
 * The :8090 door.
 *
 * Tonic serves gRPC + gRPC-Web on one TLS listener at https://10.0.0.2:8090.
 * The browser speaks gRPC-Web straight to that door.
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
import { ErrorCode, type MutationError } from "./gen/operation";
import { PluginServiceClient } from "./gen/operation.client";

export const OIA1_HEADER = "x-oracle-identity-assertion-bin";
export const SID1_HEADER = "x-opdbus-sealed-id-bin";
const DECLARED_CAPABILITY_HEADER = "x-opdbus-capability";

/** Canonical plugin object root and interface (org.opdbus.v1). */
export const PLUGIN_OBJECT_ROOT = "/org/opdbus/v1/plugins";
export const PLUGIN_INTERFACE = "org.opdbus.v1.PluginV1";

export type DoorIdentity =
  | { kind: "oia1"; assertion: string }
  | { kind: "sid1"; sealedId: string };

export interface DoorConfig {
  /** Origin of the tonic TLS door, https://10.0.0.2:8090 */
  url: string;
  identity: DoorIdentity;
  /** Default per-call deadline in milliseconds; a call may override it. */
  timeoutMs?: number;
}

export interface CallEnvelope<T> {
  result: T;
  eventId: string;
  eventHash: string;
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

export function normalizeDoorUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new DoorError("INVALID_ARGUMENT", "Door URL must be an absolute https origin.");
  }
  if (parsed.protocol !== "https:") {
    throw new DoorError("INVALID_ARGUMENT", "The door is TLS only; use an https URL.");
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new DoorError("INVALID_ARGUMENT", "Door URL must be an origin with no path.");
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
  private meta: Record<string, string>;
  private readonly timeoutMs: number;

  constructor(config: DoorConfig) {
    this.url = normalizeDoorUrl(config.url);
    this.meta = identityMetadata(config.identity);
    this.timeoutMs = config.timeoutMs ?? 60_000;
    this.client = new PluginServiceClient(
      new GrpcWebFetchTransport({
        baseUrl: this.url,
        format: "binary",
        fetchInit: { credentials: "omit" },
      }),
    );
  }

  /**
   * Replace the credential carried on every subsequent call. Used when a
   * short-lived OIA1 assertion is renewed from the decoy before it expires;
   * the connection, catalog and chat state are untouched.
   */
  setIdentity(identity: DoorIdentity): void {
    this.meta = identityMetadata(identity);
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
    let response;
    try {
      ({ response } = await this.client.callMethod(
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
          meta: { ...this.meta, [DECLARED_CAPABILITY_HEADER]: capability },
          timeout: options.timeoutMs ?? this.timeoutMs,
        },
      ));
    } catch (error) {
      if (error instanceof RpcError) {
        console.error("[door] rpc failed", { pluginId, method, code: error.code, detail: error.message });
        if (error.code === "INTERNAL" && /failed to fetch|fetch failed|networkerror/i.test(error.message)) {
          throw new DoorError("UNAVAILABLE", `Cannot reach the door at ${this.url}. Check your network connection and certificate trust.`, error.message);
        }
        throw new DoorError(error.code, userSafeMessage(error.code, ""), error.message);
      }
      console.error("[door] transport failed", { pluginId, method, error });
      throw new DoorError("UNAVAILABLE", userSafeMessage("UNAVAILABLE", ""));
    }

    if (response.error) {
      const code = mutationErrorCode(response.error);
      console.error("[door] dispatch refused", { pluginId, method, code, detail: response.error.message });
      throw new DoorError(code, userSafeMessage(code, response.error.message));
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
  if (config.identity.kind === "sid1") return config.identity;
  const client = new DoorClient(config);
  const usedAssertions = new Set<string>([config.identity.assertion]);
  let registrationPubkey: string | undefined;
  let context: { session_id: string } | undefined;
  try {
    ({ result: context } = await client.call<{ session_id: string }>(
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
    ({ result: context } = await client.call<{ session_id: string }>(
      "project", "get_context", {}, "chat.context",
    ));
  }

  async function nextFreshOia(): Promise<Extract<DoorIdentity, { kind: "oia1" }>> {
    const identity = await nextIdentity();
    if (identity.kind !== "oia1" || usedAssertions.has(identity.assertion)) {
      throw new DoorError("UNAUTHENTICATED", "A fresh identity assertion is required to read your session.");
    }
    // Decode every refreshed assertion in the bootstrap path and bind all
    // subsequent calls to the same public key.
    if (registrationPubkey && readOiaPublicKey(identity.assertion) !== registrationPubkey) {
      throw new DoorError("UNAUTHENTICATED", "The refreshed identity belongs to a different WireGuard key.");
    }
    usedAssertions.add(identity.assertion);
    return identity;
  }

  if (typeof context?.session_id !== "string" || !context.session_id.trim()) {
    throw new DoorError("INTERNAL", "The server did not identify your session.");
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
    return { kind: "sid1", sealedId: btoa(wire) };
  } catch {
    throw new DoorError("UNAUTHENTICATED", "The server returned an invalid session credential.");
  }
}

/** Extract the public key field from the documented OIA1 wire frame. This is
 * framing only; the bridge remains responsible for verifying its signature. */
function readOiaPublicKey(assertion: string): string {
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
    offset += 8 + 8 + 16;
    if (offset >= bytes.length) throw new Error("truncated OIA1 address");
    const ipFamily = bytes[offset++];
    const ipLength = ipFamily === 4 ? 4 : ipFamily === 6 ? 16 : 0;
    if (!ipLength || offset + ipLength > bytes.length) throw new Error("invalid OIA1 address");
    offset += ipLength;
    readString(); // decoy key id
    if (offset + 64 !== bytes.length) throw new Error("invalid OIA1 signature framing");
    return publicKey;
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
