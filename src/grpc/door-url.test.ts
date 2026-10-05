import { afterEach, describe, expect, it, vi } from "vitest";
import { PluginServiceClient } from "./gen/operation.client";
import { Value } from "./gen/google/protobuf/struct";
import { DoorClient, OIA1_HEADER, SID1_HEADER, normalizeDoorUrl, sameOriginDoorUrl } from "./door";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function page(origin: string): void {
  vi.stubGlobal("window", { location: { origin } });
}

describe("door origin validation", () => {
  it.each(["http://10.0.0.4:8080", "http://10.0.0.2:8080"])(
    "uses the connector only on its exact canonical page %s", (origin) => {
      page(origin);
      expect(sameOriginDoorUrl()).toBe(origin);
      expect(normalizeDoorUrl(` ${origin}/ `)).toBe(origin);
      const other = origin.includes("10.0.0.4") ? "http://10.0.0.2:8080" : "http://10.0.0.4:8080";
      expect(() => normalizeDoorUrl(other)).toThrow("same-origin connector");
    },
  );

  it("keeps direct HTTPS doors valid on other pages", () => {
    page("https://page.example");
    expect(sameOriginDoorUrl()).toBeUndefined();
    expect(normalizeDoorUrl(" https://10.0.0.2:8090/ ")).toBe("https://10.0.0.2:8090");
    expect(normalizeDoorUrl("https://door.example:8090")).toBe("https://door.example:8090");
    expect(() => normalizeDoorUrl("http://10.0.0.4:8080")).toThrow();
  });

  it.each([
    "http://10.0.0.4", "http://10.0.0.4:8090", "http://10.0.0.4.evil:8080",
    "http://remote.example", "http://localhost:8080", "//10.0.0.4:8080",
    "https://user:secret@door.example", "https://door.example/call",
    "https://door.example/path/..", "https://door.example//", "https://door.example/?x=1",
    "https://door.example/#fragment", "https://door.example?", "https://door.example#",
    "https://door.example\\", "https://door.example/\\", "https://door.example/%2e",
  ])("rejects unsafe or non-origin URL %s", (url) => {
    page("http://10.0.0.4:8080");
    expect(() => normalizeDoorUrl(url)).toThrow();
  });

  it("does not enable an HTTP connector on an arbitrary HTTP page", () => {
    page("http://remote.example");
    expect(sameOriginDoorUrl()).toBeUndefined();
    expect(() => normalizeDoorUrl("http://remote.example")).toThrow();
  });

  it("forwards exactly one unchanged credential when the connector credential is renewed", async () => {
    page("http://10.0.0.4:8080");
    const call = vi.spyOn(PluginServiceClient.prototype, "callMethod").mockReturnValue(
      Promise.resolve({ response: { result: Value.fromJson({ result: {} }) } }) as never,
    );
    const client = new DoorClient({ url: window.location.origin, identity: { kind: "oia1", assertion: "T0lBMQ==" } });
    expect(client.url).toBe("http://10.0.0.4:8080");
    await client.call("fixture", "read", {}, "fixture.read");
    client.setIdentity({ kind: "sid1", sealedId: "U0lEMQ==" });
    await client.call("fixture", "read", {}, "fixture.read");
    expect(call.mock.calls.map(([, options]) => options?.meta)).toEqual([
      { [OIA1_HEADER]: "T0lBMQ==", "x-opdbus-capability": "fixture.read" },
      { [SID1_HEADER]: "U0lEMQ==", "x-opdbus-capability": "fixture.read" },
    ]);
  });
});
