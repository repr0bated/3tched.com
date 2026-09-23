import { afterEach, describe, expect, it, vi } from "vitest";
import { PluginServiceClient } from "./gen/operation.client";
import { Value } from "./gen/google/protobuf/struct";
import { OIA1_HEADER, readSessionIdentity } from "./door";

const config = { url: "https://10.0.0.2:8090", identity: { kind: "oia1" as const, assertion: "T0xE" } };
const fresh = () => Promise.resolve({ kind: "oia1" as const, assertion: "TkVX" });
function reply(result: unknown) {
  return Promise.resolve({ response: { result: Value.fromJson({ result } as never) } }) as never;
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
      { [OIA1_HEADER]: "T0xE" }, { [OIA1_HEADER]: "TkVX" },
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
});
