/**
 * The :8090 door.
 *
 * op-grpc-bridge serves gRPC + gRPC-Web on one TLS listener (svc0, 10.0.0.3:8090
 * and 127.0.0.1:8090). This module is the only place the browser talks to it.
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

/** Canonical plugin object root and interface (org.opdbus.v1). */
export const PLUGIN_OBJECT_ROOT = "/org/opdbus/v1/plugins";
export const PLUGIN_INTERFACE = "org.opdbus.v1.PluginV1";

export type DoorIdentity =
  | { kind: "oia1"; assertion: string }
  | { kind: "sid1"; sealedId: string };

export interface DoorConfig {
  /** Origin of the door, e.g. https://10.0.0.3:8090 */
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
  constructor(code: string, message: string) {
    super(message);
    this.name = "DoorError";
    this.code = code;
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
  private readonly meta: Record<string, string>;
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
        { meta: this.meta, timeout: options.timeoutMs ?? this.timeoutMs },
      ));
    } catch (error) {
      if (error instanceof RpcError) {
        console.error("[door] rpc failed", { pluginId, method, code: error.code, detail: error.message });
        throw new DoorError(error.code, userSafeMessage(error.code, ""));
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
