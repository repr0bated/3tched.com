import { afterEach, describe, expect, it, vi } from "vitest";
import { RpcError } from "@protobuf-ts/runtime-rpc";
import { PluginServiceClient } from "./gen/operation.client";
import { Value } from "./gen/google/protobuf/struct";
import { DoorClient, DoorError, OIA1_HEADER, SID1_HEADER, readSessionIdentity } from "./door";

const config = { url: "https://10.0.0.2:8090", identity: { kind: "oia1" as const, assertion: "T0xE" } };
const fresh = () => Promise.resolve({ kind: "oia1" as const, assertion: "TkVX" });
function reply(result: unknown) {
  return Promise.resolve({ response: { result: Value.fromJson({ result } as never) } }) as never;
}
function oia(seed: number, publicKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(seed)))) {
  const chunks: number[] = [0x4f, 0x49, 0x41, 0x31];
  const pushString = (value: string) => {
    const encoded = new TextEncoder().encode(value);
    chunks.push(encoded.length, 0, 0, 0, ...encoded);
  };
  pushString(publicKey);
  chunks.push(...new Uint8Array(8), ...new Uint8Array(8), ...new Uint8Array(16).fill(seed));
  chunks.push(4, 127, 0, 0, 1);
  pushString("decoy");
  chunks.push(...new Uint8Array(64));
  return { kind: "oia1" as const, assertion: btoa(String.fromCharCode(...chunks)), publicKey };
}
afterEach(() => vi.restoreAllMocks());

describe("server-owned session credential pickup", () => {
  it("uses different assertions and reads only the server-resolved session", async () => {
    const call = vi.spyOn(PluginServiceClient.prototype, "callMethod")
      .mockReturnValueOnce(reply({ session_id: "mine" }))
      .mockReturnValueOnce(reply({ identity: { session_id: "mine", sealed_id: "sid1:U0lEMf7_" } }));
    await expect(readSessionIdentity(config, fresh)).resolves.toEqual({ kind: "sid1", sealedId: "U0lEMf7/" });
    expect(call.mock.calls.map(([request]) => [request.pluginId, request.methodName, request.capabilityId])).toEqual([
      ["project", "get_context", "chat.context"],
      ["identity_sled", "get_identity", "identity_sled.read"],
    ]);
    expect(Value.toJson(call.mock.calls[1][0].arguments[0])).toEqual({ session_id: "mine" });
    expect(call.mock.calls.map(([, options]) => options?.meta)).toEqual([
      { [OIA1_HEADER]: "T0xE", "x-opdbus-capability": "chat.context" },
      { [OIA1_HEADER]: "TkVX", "x-opdbus-capability": "identity_sled.read" },
    ]);
  });

  it("never falls back to the host identity when the session is missing", async () => {
    const call = vi.spyOn(PluginServiceClient.prototype, "callMethod").mockReturnValue(reply({ session_id: "" }));
    await expect(readSessionIdentity(config, fresh)).rejects.toThrow("did not identify your session");
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("refuses a reused assertion before reading the sled", async () => {
    const call = vi.spyOn(PluginServiceClient.prototype, "callMethod").mockReturnValue(reply({ session_id: "mine" }));
    await expect(readSessionIdentity(config, async () => config.identity)).rejects.toThrow("fresh identity assertion");
    expect(call).toHaveBeenCalledTimes(1);
  });

  it.each([
    { session_id: "someone-else", sealed_id: "sid1:U0lEMQ" },
    { session_id: "mine", sealed_id: null },
    { session_id: "mine", sealed_id: "sid1:QUJD" },
  ])("rejects an incorrect or missing server credential", async (identity) => {
    vi.spyOn(PluginServiceClient.prototype, "callMethod")
      .mockReturnValueOnce(reply({ session_id: "mine" }))
      .mockReturnValueOnce(reply({ identity }));
    await expect(readSessionIdentity(config, fresh)).rejects.toThrow();
  });

  it("keeps a projected SID1 without requesting another identity", async () => {
    const identity = { kind: "sid1" as const, sealedId: "U0lEMQ==" };
    const next = vi.fn(fresh);
    await expect(readSessionIdentity({ ...config, identity }, next)).resolves.toEqual(identity);
    expect(next).not.toHaveBeenCalled();
  });

  it("registers only the OIA1 key after UnknownPrincipal, then uses fresh assertions per call", async () => {
    const initial = oia(1);
    const registration = oia(2, initial.publicKey);
    const context = oia(3, initial.publicKey);
    const sled = oia(4, initial.publicKey);
    const next = vi.fn()
      .mockResolvedValueOnce(registration)
      .mockResolvedValueOnce(context)
      .mockResolvedValueOnce(sled);
    const call = vi.spyOn(PluginServiceClient.prototype, "callMethod")
      .mockRejectedValueOnce(new RpcError("UnknownPrincipal", "UNAUTHENTICATED") as never)
      .mockReturnValueOnce(reply({ principal: { human_pubkey: initial.publicKey } }))
      .mockReturnValueOnce(reply({ session_id: "mine" }))
      .mockReturnValueOnce(reply({ identity: { session_id: "mine", sealed_id: "sid1:U0lEMf7_" } }));

    await expect(readSessionIdentity({ ...config, identity: initial }, next))
      .resolves.toEqual({ kind: "sid1", sealedId: "U0lEMf7/" });
    expect(call.mock.calls.map(([request]) => [request.pluginId, request.methodName, request.capabilityId])).toEqual([
      ["project", "get_context", "chat.context"],
      ["human_principal", "register_key", "human_principal.write"],
      ["project", "get_context", "chat.context"],
      ["identity_sled", "get_identity", "identity_sled.read"],
    ]);
    expect(Value.toJson(call.mock.calls[1][0].arguments[0])).toEqual({ human_pubkey: initial.publicKey });
    const metas = call.mock.calls.map(([, options]) => options?.meta ?? {});
    expect(metas.map((meta) => meta["x-opdbus-capability"])).toEqual([
      "chat.context", "human_principal.write", "chat.context", "identity_sled.read",
    ]);
    expect(metas.map((meta) => Object.keys(meta).filter((key) => key.endsWith("-bin")))).toEqual([
      [OIA1_HEADER], [OIA1_HEADER], [OIA1_HEADER], [OIA1_HEADER],
    ]);
    expect(metas.map((meta) => meta[OIA1_HEADER])).toEqual([
      initial.assertion, registration.assertion, context.assertion, sled.assertion,
    ]);
    expect(metas.every((meta) => !(SID1_HEADER in meta))).toBe(true);
    expect(next).toHaveBeenCalledTimes(3);
  });

  it("preserves raw status detail without changing the safe error message", async () => {
    vi.spyOn(PluginServiceClient.prototype, "callMethod")
      .mockRejectedValue(new RpcError("UnknownPrincipal", "UNAUTHENTICATED") as never);
    const client = new DoorClient({ ...config, identity: oia(9) });
    await expect(client.call("project", "get_context", {}, "chat.context")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      statusDetail: "UnknownPrincipal",
      message: "The door did not accept the identity credential.",
    });
  });

  it.each([
    { name: "different gRPC status", error: new RpcError("PermissionDenied", "PERMISSION_DENIED") },
    { name: "different status detail", error: new RpcError("RevokedPrincipal", "UNAUTHENTICATED") },
  ])("does not register after $name", async ({ error }) => {
    const next = vi.fn(fresh);
    const call = vi.spyOn(PluginServiceClient.prototype, "callMethod").mockRejectedValue(error as never);
    await expect(readSessionIdentity(config, next)).rejects.toBeInstanceOf(DoorError);
    expect(call).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });

  it("stops after registration is denied and does not retry the mutation", async () => {
    const initial = oia(5);
    const registration = oia(6, initial.publicKey);
    const next = vi.fn().mockResolvedValue(registration);
    const call = vi.spyOn(PluginServiceClient.prototype, "callMethod")
      .mockRejectedValueOnce(new RpcError("UnknownPrincipal", "UNAUTHENTICATED") as never)
      .mockRejectedValueOnce(new RpcError("NoGrant", "PERMISSION_DENIED") as never);
    await expect(readSessionIdentity({ ...config, identity: initial }, next)).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    });
    expect(call).toHaveBeenCalledTimes(2);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("fails closed on malformed OIA1 and mismatched refreshed key before registration", async () => {
    const malformed = { kind: "oia1" as const, assertion: btoa("not-an-OIA1-frame") };
    const next = vi.fn(fresh);
    const call = vi.spyOn(PluginServiceClient.prototype, "callMethod")
      .mockRejectedValue(new RpcError("UnknownPrincipal", "UNAUTHENTICATED") as never);
    await expect(readSessionIdentity({ ...config, identity: malformed }, next)).rejects.toThrow("assertion is malformed");
    expect(call).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();

    const initial = oia(7);
    call.mockReset()
      .mockRejectedValueOnce(new RpcError("UnknownPrincipal", "UNAUTHENTICATED") as never);
    const mismatch = vi.fn().mockResolvedValue(oia(8));
    await expect(readSessionIdentity({ ...config, identity: initial }, mismatch))
      .rejects.toThrow("different WireGuard key");
    expect(call).toHaveBeenCalledTimes(1);
  });
});
