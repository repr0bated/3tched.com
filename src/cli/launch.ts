import { connect as connectTcp } from "node:net";
import { readFile } from "node:fs/promises";
import {
  defaultDoorUrl,
  fetchIssuedIdentity,
  identityPickupReport,
  issuerUrl,
} from "../chat/door-config";
import {
  DoorError,
  normalizeDoorUrl,
  readSessionConfig,
  type DoorConfig,
  type DoorIdentity,
} from "../grpc/door";
import { nativeFetch } from "./native-http";
import { oracleOriginPin } from "./mcp-identity";
import type { McpConfig } from "./mcp-proxy";
import { CliUsageError, type CliInvocation } from "./args";

function credentialFromText(kind: DoorIdentity["kind"], text: string): DoorIdentity {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new DoorError("INVALID_ARGUMENT", "Credential file is not JSON.");
    }
    if (!parsed || typeof parsed !== "object") throw new DoorError("INVALID_ARGUMENT", "Credential file is not an identity.");
    const record = parsed as Record<string, unknown>;
    if (record.kind !== kind) throw new DoorError("INVALID_ARGUMENT", "Credential file kind does not match the flag.");
    if (kind === "oia1" && typeof record.assertion === "string") return { kind, assertion: record.assertion };
    if (kind === "sid1" && typeof record.sealedId === "string") return { kind, sealedId: record.sealedId };
    throw new DoorError("INVALID_ARGUMENT", "Credential file is missing its value.");
  }
  if (kind === "oia1") return { kind, assertion: trimmed };
  return { kind: "sid1", sealedId: trimmed };
}

const FORWARDED_ISSUER = "http://127.0.0.1:51888";

/** An SSH -R of the decoy issuer onto this host's loopback. */
function forwardedIssuer(): Promise<string | undefined> {
  return new Promise((resolve) => {
    const socket = connectTcp({ host: "127.0.0.1", port: 51888 });
    const finish = (value?: string) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(300);
    socket.once("connect", () => finish(FORWARDED_ISSUER));
    socket.once("timeout", () => finish());
    socket.once("error", () => finish());
  });
}

function doorUrl(explicit: string | undefined, fallback = defaultDoorUrl()): string {
  const door = explicit ?? fallback;
  if (!door) throw new CliUsageError("Pass --door with an https origin.");
  return door;
}

/**
 * Same launch as the page: the decoy issues a fresh OIA1 for this tunnel,
 * then the door returns the session credential it already holds. A file
 * overrides that pickup.
 */
export async function launchDoorConfig(invocation: CliInvocation): Promise<DoorConfig> {
  if (invocation.sid1File) {
    return {
      url: doorUrl(invocation.door),
      identity: credentialFromText("sid1", await readFile(invocation.sid1File, "utf8")),
    };
  }
  if (invocation.oia1File) {
    return readSessionConfig(
      { url: doorUrl(invocation.door), identity: credentialFromText("oia1", await readFile(invocation.oia1File, "utf8")) },
      async () => {
        throw new DoorError(
          "UNAUTHENTICATED",
          "That OIA1 file is one assertion. Leave it off so the issuer can supply the next one.",
        );
      },
    );
  }

  const issuer = (invocation.issuer ?? (await forwardedIssuer()) ?? issuerUrl())?.trim().replace(/\/+$/, "");
  if (!issuer) throw new CliUsageError("No identity issuer is configured. Pass --issuer.");
  const projected = await fetchIssuedIdentity(fetch, issuer);
  if (!projected) {
    throw new DoorError("UNAUTHENTICATED", identityPickupReport() ?? "The issuer did not return an identity.");
  }
  const pickupIssuer = projected.sourceIssuer ?? issuer;
  return readSessionConfig(
    { url: doorUrl(invocation.door, projected.door), identity: projected.identity },
    async () => {
      const fresh = await fetchIssuedIdentity(fetch, pickupIssuer);
      if (
        !fresh ||
        normalizeDoorUrl(fresh.door) !== normalizeDoorUrl(projected.door) ||
        fresh.sourceIssuer !== projected.sourceIssuer ||
        (projected.issuerDoor &&
          (!fresh.issuerDoor || normalizeDoorUrl(fresh.issuerDoor) !== normalizeDoorUrl(projected.issuerDoor)))
      ) {
        throw new DoorError(
          "UNAUTHENTICATED",
          "Your identity connection could not provide a fresh assertion. Retry to reconnect.",
        );
      }
      return fresh.identity;
    },
  );
}

/** MCP binds the remote WG origin directly; it never bootstraps chat or identity_sled. */
export async function launchMcpConfig(invocation: CliInvocation): Promise<McpConfig> {
  const fetchImpl = await nativeFetch(invocation.ca ?? process.env.NODE_EXTRA_CA_CERTS);
  if (invocation.sid1File) {
    return {
      url: normalizeDoorUrl(doorUrl(invocation.door)),
      identity: credentialFromText("sid1", await readFile(invocation.sid1File, "utf8")),
      fetchImpl,
    };
  }
  if (invocation.oia1File) {
    const identity = credentialFromText("oia1", await readFile(invocation.oia1File, "utf8"));
    oracleOriginPin(identity);
    let used = false;
    return {
      url: normalizeDoorUrl(doorUrl(invocation.door)), identity, fetchImpl,
      nextIdentity: async () => {
        if (used) throw new DoorError("UNAUTHENTICATED", "OIA1 assertions are single-use. Reconnect with --issuer for fresh assertions.");
        used = true;
        return identity;
      },
    };
  }
  const issuer = (invocation.issuer ?? (await forwardedIssuer()) ?? issuerUrl())?.trim().replace(/\/+$/, "");
  if (!issuer) throw new CliUsageError("No identity issuer is configured. Pass --issuer.");
  const first = await fetchIssuedIdentity(fetchImpl, issuer);
  if (!first) throw new DoorError("UNAUTHENTICATED", identityPickupReport() ?? "The issuer did not return an identity.");
  const pin = oracleOriginPin(first.identity);
  const advertisedDoor = normalizeDoorUrl(first.issuerDoor ?? first.door);
  let invalid = false;
  return {
    url: normalizeDoorUrl(doorUrl(invocation.door, first.door)), identity: first.identity, fetchImpl,
    nextIdentity: async () => {
      if (invalid) throw new DoorError("UNAUTHENTICATED", "The WireGuard origin changed. Reconnect to establish a new MCP session.");
      // Startup pins the origin; even initialize obtains a newly issued proof.
      // The client may have waited on stdin longer than the startup proof's TTL.
      const fresh = await fetchIssuedIdentity(fetchImpl, issuer);
      if (!fresh) throw new DoorError("UNAUTHENTICATED", "The pinned issuer could not provide a fresh assertion.");
      try {
        if (fresh.sourceIssuer !== first.sourceIssuer ||
            normalizeDoorUrl(fresh.door) !== normalizeDoorUrl(first.door) ||
            normalizeDoorUrl(fresh.issuerDoor ?? fresh.door) !== advertisedDoor ||
            oracleOriginPin(fresh.identity) !== pin) {
          throw new Error("Origin changed.");
        }
      } catch {
        invalid = true;
        throw new DoorError("UNAUTHENTICATED", "The WireGuard origin changed. Reconnect to establish a new MCP session.");
      }
      return fresh.identity;
    },
  };
}
