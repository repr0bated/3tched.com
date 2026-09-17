import { describe, expect, it, vi } from "vitest";
import { IDENTITY_SELF_PATH, fetchProjectedIdentity } from "./door-config";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("fetchProjectedIdentity", () => {
  it("returns the door and SID1 the origin projected for this arrival", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        door: "https://10.0.0.3:8090",
        identity: { kind: "sid1", sealedId: "U0lEMQ==" },
        session_id: "f036f8d8",
      }),
    );
    await expect(fetchProjectedIdentity(fetchImpl as unknown as typeof fetch)).resolves.toEqual({
      door: "https://10.0.0.3:8090",
      identity: { kind: "sid1", sealedId: "U0lEMQ==" },
      sessionId: "f036f8d8",
    });
    expect(fetchImpl).toHaveBeenCalledWith(IDENTITY_SELF_PATH, expect.objectContaining({ cache: "no-store" }));
  });

  it("falls back to the gate on 404, on an HTML fallback page, and on transport failure", async () => {
    const notFound = vi.fn(async () => jsonResponse(404, { error: "no identity is projected for this source" }));
    await expect(fetchProjectedIdentity(notFound as unknown as typeof fetch)).resolves.toBeNull();

    const spa = vi.fn(async () => new Response("<!doctype html><html></html>", { status: 200 }));
    await expect(fetchProjectedIdentity(spa as unknown as typeof fetch)).resolves.toBeNull();

    const boom = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(fetchProjectedIdentity(boom as unknown as typeof fetch)).resolves.toBeNull();
  });

  it("ignores a body whose identity is not a well-formed credential", async () => {
    const bad = vi.fn(async () => jsonResponse(200, { door: "https://x", identity: { kind: "sid1" } }));
    await expect(fetchProjectedIdentity(bad as unknown as typeof fetch)).resolves.toBeNull();
  });
});
