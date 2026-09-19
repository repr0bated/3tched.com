import { describe, expect, it, vi } from "vitest";
import {
  IDENTITY_SELF_PATH,
  ISSUER_IDENTITY_PATH,
  RENEW_LEAD_SECONDS,
  fetchIssuedIdentity,
  fetchProjectedIdentity,
  renewalDelayMs,
} from "./door-config";

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

describe("fetchIssuedIdentity (OIA1 pickup from the decoy issuer)", () => {
  it("fetches the issuer cross-origin without credentials and keeps expires_at", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        door: "https://10.0.0.3:8090",
        identity: { kind: "oia1", assertion: "QUJDRA==" },
        expires_at: 1_700_000_300,
      }),
    );
    await expect(
      fetchIssuedIdentity(fetchImpl as unknown as typeof fetch, "http://10.10.0.1:51888/"),
    ).resolves.toEqual({
      door: "https://10.0.0.3:8090",
      identity: { kind: "oia1", assertion: "QUJDRA==" },
      sessionId: undefined,
      expiresAt: 1_700_000_300,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      `http://10.10.0.1:51888${ISSUER_IDENTITY_PATH}`,
      expect.objectContaining({ mode: "cors", credentials: "omit", cache: "no-store" }),
    );
  });

  it("is null without an issuer, on refusal, and on transport failure", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { identity: { kind: "oia1", assertion: "QUJDRA==" } }));
    await expect(fetchIssuedIdentity(fetchImpl as unknown as typeof fetch, undefined)).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();

    const denied = vi.fn(async () => new Response("no verified peer for source\n", { status: 403 }));
    await expect(fetchIssuedIdentity(denied as unknown as typeof fetch, "http://10.10.0.1:51888")).resolves.toBeNull();

    const boom = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(fetchIssuedIdentity(boom as unknown as typeof fetch, "http://10.10.0.1:51888")).resolves.toBeNull();
  });

  it("renews a lead time before expiry and never for identities without one", () => {
    const issued = { door: "d", identity: { kind: "oia1" as const, assertion: "QQ==" }, expiresAt: 1_000 };
    expect(renewalDelayMs(issued, 1_000 - RENEW_LEAD_SECONDS - 10)).toBe(10_000);
    expect(renewalDelayMs(issued, 1_000)).toBe(0);
    expect(renewalDelayMs({ door: "d", identity: { kind: "sid1" as const, sealedId: "QQ==" } }, 0)).toBeNull();
  });
});
