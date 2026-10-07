import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DoorConfig, DoorIdentity } from "../grpc/door";

const { fetchIssuedIdentity, readSessionConfig } = vi.hoisted(() => ({
  fetchIssuedIdentity: vi.fn(),
  readSessionConfig: vi.fn(),
}));

vi.mock("../chat/door-config", () => ({
  fetchIssuedIdentity: (...args: unknown[]) => fetchIssuedIdentity(...args),
  issuerUrl: () => "http://10.0.0.1:51888",
  defaultDoorUrl: () => "https://10.0.0.2:8090",
  identityPickupReport: () => "decoy issuer (http://10.0.0.1:51888): refused this device (403)",
}));

vi.mock("../grpc/door", async () => {
  const actual = await vi.importActual<typeof import("../grpc/door")>("../grpc/door");
  return {
    ...actual,
    readSessionConfig: (...args: unknown[]) => readSessionConfig(...args),
  };
});

import { parseArgs } from "./args";
import { launchDoorConfig } from "./launch";

const directories: string[] = [];

afterEach(async () => {
  fetchIssuedIdentity.mockReset();
  readSessionConfig.mockReset();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const issued = {
  door: "https://10.0.0.2:8090",
  identity: { kind: "oia1", assertion: "first" } satisfies DoorIdentity,
  sourceIssuer: "http://10.0.0.1:51888",
  issuerDoor: "https://10.0.0.2:8090",
};

describe("launch identity", () => {
  it("asks the configured issuer, then reads the session credential", async () => {
    fetchIssuedIdentity.mockResolvedValueOnce(issued).mockResolvedValueOnce({
      ...issued,
      identity: { kind: "oia1", assertion: "second" },
    });
    readSessionConfig.mockImplementation(async (config: DoorConfig, next: () => Promise<DoorIdentity>) => {
      const fresh = await next();
      return { url: config.url, identity: { kind: "sid1", sealedId: "sid" }, fresh };
    });

    const config = await launchDoorConfig(parseArgs(["providers"]));
    expect(fetchIssuedIdentity).toHaveBeenNthCalledWith(1, fetch, "http://10.0.0.1:51888");
    expect(config.identity).toEqual({ kind: "sid1", sealedId: "sid" });
    expect(config).toMatchObject({ fresh: { kind: "oia1", assertion: "second" } });
  });

  it("names the issuer when pickup is refused", async () => {
    fetchIssuedIdentity.mockResolvedValue(null);
    await expect(launchDoorConfig(parseArgs(["providers"]))).rejects.toThrow(/refused this device/);
    expect(readSessionConfig).not.toHaveBeenCalled();
  });

  it("uses a SID1 file without asking the issuer", async () => {
    const directory = await mkdtemp(join(tmpdir(), "3tched-cli-"));
    directories.push(directory);
    const file = join(directory, "sid1");
    await writeFile(file, "c2VhbGVk\n");
    const config = await launchDoorConfig(parseArgs(["--sid1-file", file, "providers"]));
    expect(config.identity).toEqual({ kind: "sid1", sealedId: "c2VhbGVk" });
    expect(fetchIssuedIdentity).not.toHaveBeenCalled();
  });
});
