import { DoorError, OIA1_HEADER, SID1_HEADER, type DoorIdentity } from "../grpc/door";

function wireBytes(value: string): Buffer {
  const text = value.trim();
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(text)) throw new DoorError("INVALID_ARGUMENT", "Invalid binary identity encoding.");
  const bytes = Buffer.from(text, "base64");
  const canonical = text.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  if (bytes.toString("base64url") !== canonical) throw new DoorError("INVALID_ARGUMENT", "Invalid binary identity encoding.");
  return bytes;
}

/** HTTP MCP uses unpadded base64url; gRPC-Web's standard base64 is a different encoding. */
export function mcpIdentityMetadata(identity: DoorIdentity): Record<string, string> {
  return identity.kind === "oia1"
    ? { [OIA1_HEADER]: wireBytes(identity.assertion).toString("base64url") }
    : { [SID1_HEADER]: wireBytes(identity.sealedId).toString("base64url") };
}

/** Pin routing identity only. The door, never the CLI, verifies the signature and grants. */
export function oracleOriginPin(identity: DoorIdentity): string {
  if (identity.kind !== "oia1") throw new DoorError("UNAUTHENTICATED", "The issuer must return an OIA1 assertion.");
  const wire = wireBytes(identity.assertion);
  let offset = 0;
  const malformed = () => new DoorError("UNAUTHENTICATED", "Malformed OIA1 assertion from issuer.");
  const take = (length: number) => {
    if (offset + length > wire.length) throw malformed();
    const value = wire.subarray(offset, offset + length);
    offset += length;
    return value;
  };
  const string = () => {
    const bytes = take(take(4).readUInt32LE());
    const value = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!value) throw malformed();
    return value;
  };
  try {
    if (take(4).toString() !== "OIA1") throw malformed();
    const peerKey = string();
    take(32); // issued_at, expires_at, and one-use nonce are deliberately renewable.
    const family = take(1)[0];
    if (family !== 4 && family !== 6) throw malformed();
    const innerIp = take(family === 4 ? 4 : 16).toString("hex");
    const signingKey = string();
    take(64);
    if (offset !== wire.length) throw malformed();
    return JSON.stringify([peerKey, family, innerIp, signingKey]);
  } catch {
    throw malformed();
  }
}
