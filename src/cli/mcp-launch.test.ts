import { afterEach, describe, expect, it, vi } from "vitest";

const { fetchIssuedIdentity, readSessionConfig, nativeFetch } = vi.hoisted(() => ({
  fetchIssuedIdentity: vi.fn(), readSessionConfig: vi.fn(), nativeFetch: vi.fn(),
}));
vi.mock("./native-http", () => ({ nativeFetch }));
vi.mock("../chat/door-config", () => ({
  fetchIssuedIdentity, issuerUrl: () => undefined,
  defaultDoorUrl: () => "https://10.0.0.2:8090", identityPickupReport: () => "issuer refused",
}));
vi.mock("../grpc/door", async () => ({
  ...(await vi.importActual<typeof import("../grpc/door")>("../grpc/door")), readSessionConfig,
}));
import { parseArgs } from "./args";
import { launchMcpConfig } from "./launch";
import { oracleOriginPin } from "./mcp-identity";

function assertion(peer = "wireguard-peer", nonce = 1, ip = 9, signer = "decoy-key") {
  const string = (value: string) => {
    const text = Buffer.from(value);
    const length = Buffer.alloc(4); length.writeUInt32LE(text.length);
    return Buffer.concat([length, text]);
  };
  return Buffer.concat([
    Buffer.from("OIA1"), string(peer), Buffer.alloc(16), Buffer.alloc(16, nonce),
    Buffer.from([4, 10, 0, 0, ip]), string(signer), Buffer.alloc(64, 5),
  ]).toString("base64");
}
const projected = (value = assertion()) => ({
  door: "https://10.0.0.2:8090", issuerDoor: "https://10.0.0.2:8090",
  sourceIssuer: "http://10.0.0.1:51888", identity: { kind: "oia1", assertion: value },
});
const invocation = () => parseArgs(["--issuer", "http://10.0.0.1:51888", "--ca", "/tmp/trusted-ca", "mcp"]);
afterEach(() => vi.resetAllMocks());

describe("direct MCP launch", () => {
  it("uses issuer OIA1 directly, renews for the same origin, and never bootstraps chat/sled", async () => {
    const native = vi.fn(); nativeFetch.mockResolvedValue(native);
    const startup = projected(), first = projected(assertion("wireguard-peer", 2)), second = projected(assertion("wireguard-peer", 3));
    fetchIssuedIdentity.mockResolvedValueOnce(startup).mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const config = await launchMcpConfig(invocation());
    expect(readSessionConfig).not.toHaveBeenCalled();
    expect(nativeFetch).toHaveBeenCalledWith("/tmp/trusted-ca");
    expect(await config.nextIdentity!()).toEqual(first.identity);
    expect(await config.nextIdentity!()).toEqual(second.identity);
    expect(fetchIssuedIdentity.mock.calls).toEqual(Array.from({ length: 3 }, () => [native, "http://10.0.0.1:51888"]));
  });

  it.each([
    ["peer", projected(assertion("different-peer", 2))],
    ["IP scope", projected(assertion("wireguard-peer", 2, 8))],
    ["signing key", projected(assertion("wireguard-peer", 2, 9, "other-key"))],
    ["issuer", { ...projected(), sourceIssuer: "http://10.0.0.8:51888" }],
    ["door", { ...projected(), door: "https://10.0.0.8:8090" }],
    ["advertised door", { ...projected(), issuerDoor: "https://10.0.0.8:8090" }],
    ["credential kind", { ...projected(), identity: { kind: "sid1", sealedId: "U0lEMQ==" } }],
  ])("permanently refuses a %s swap without falling back or switching sessions", async (_name, changed) => {
    nativeFetch.mockResolvedValue(vi.fn());
    fetchIssuedIdentity.mockResolvedValueOnce(projected()).mockResolvedValueOnce(changed).mockResolvedValueOnce(projected());
    const config = await launchMcpConfig(invocation());
    await expect(config.nextIdentity!()).rejects.toThrow(/origin changed/);
    await expect(config.nextIdentity!()).rejects.toThrow(/origin changed/);
    expect(fetchIssuedIdentity).toHaveBeenCalledTimes(2);
    expect(readSessionConfig).not.toHaveBeenCalled();
  });

  it("rejects malformed OIA framing rather than trusting an identity label", () => {
    expect(() => oracleOriginPin({ kind: "oia1", assertion: "T0lBMQ==" })).toThrow(/Malformed OIA1/);
    expect(() => oracleOriginPin({ kind: "oia1", assertion: "@@@@" })).toThrow(/Invalid binary/);
  });
});
