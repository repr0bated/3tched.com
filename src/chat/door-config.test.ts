import { afterEach, describe, expect, it, vi } from "vitest";
import {
  IDENTITY_SELF_PATH,
  ISSUER_IDENTITY_PATH,
  RENEW_LEAD_SECONDS,
  fetchIssuedIdentity,
  fetchProjectedIdentity,
  identityPickupReport,
  renewalDelayMs,
  resolveIdentity,
  IDENTITY_PICKUP_TIMEOUT_MS,
  defaultDoorUrl,
} from "./door-config";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("canonical page connector selection", () => {
  afterEach(() => {
    localStorage.removeItem("3tched.door");
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each(["http://10.0.0.4:8080", "http://10.0.0.2:8080"])(
    "overrides stale door sources consistently on %s", async (origin) => {
      localStorage.setItem("3tched.door", "https://10.0.0.4");
      vi.stubEnv("VITE_OPDBUS_DOOR", "https://10.0.0.2:8090");
      vi.stubGlobal("window", {
        location: { origin },
        __3TCHED_CONFIG__: { door: "https://10.0.0.2" },
      });
      expect(defaultDoorUrl()).toBe(origin);
      const firstIdentity = { kind: "oia1", assertion: "T0lBMQ==" };
      const refreshedIdentity = { kind: "oia1", assertion: "TkVXMQ==" };
      const fetchImpl = vi.fn()
        .mockResolvedValueOnce(jsonResponse(404, {}))
        .mockResolvedValueOnce(jsonResponse(200, { door: "https://10.0.0.4", identity: firstIdentity }))
        .mockResolvedValueOnce(jsonResponse(200, { door: "https://10.0.0.2:8090", identity: refreshedIdentity }));
      window.__3TCHED_CONFIG__!.issuer = "http://10.0.0.1:51888";
      const initial = await resolveIdentity(fetchImpl as unknown as typeof fetch);
      const refreshed = await fetchIssuedIdentity(fetchImpl as unknown as typeof fetch);
      expect(initial).toMatchObject({ door: origin, identity: firstIdentity });
      expect(refreshed).toMatchObject({ door: origin, identity: refreshedIdentity });
      expect(fetchImpl).toHaveBeenCalledTimes(3);
    },
  );

  it("keeps injected credentials unchanged when selecting the page connector", async () => {
    const identity = { kind: "sid1" as const, sealedId: "U0lEMQ==" };
    vi.stubGlobal("window", {
      location: { origin: "http://10.0.0.4:8080" },
      __3TCHED_CONFIG__: { door: "https://10.0.0.4", identity },
    });
    const fetchImpl = vi.fn();
    expect(await resolveIdentity(fetchImpl)).toEqual({ door: "http://10.0.0.4:8080", identity });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("retains the direct HTTPS door from identity documents on other pages", async () => {
    vi.stubGlobal("window", { location: { origin: "https://page.example" } });
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      door: "https://10.0.0.2:8090", identity: { kind: "sid1", sealedId: "U0lEMQ==" },
    }));
    await expect(fetchProjectedIdentity(fetchImpl as unknown as typeof fetch)).resolves.toMatchObject({
      door: "https://10.0.0.2:8090",
    });
  });
});

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
      sourceIssuer: "http://10.10.0.1:51888",
      issuerDoor: "https://10.0.0.3:8090",
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

  it("aborts a stalled same-origin pickup and proceeds to the issuer", async () => {
    const priorConfig = window.__3TCHED_CONFIG__;
    window.__3TCHED_CONFIG__ = { door: "https://10.0.0.3:8090", issuer: "http://10.10.0.1:51888" };
    vi.useFakeTimers();
    const fetchImpl = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url) === IDENTITY_SELF_PATH) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        });
      }
      return Promise.resolve(jsonResponse(200, {
        door: "https://10.0.0.3:8090",
        identity: { kind: "oia1", assertion: "QUJDRA==" },
      }));
    });

    try {
      const pending = resolveIdentity(fetchImpl as unknown as typeof fetch);
      await vi.advanceTimersByTimeAsync(IDENTITY_PICKUP_TIMEOUT_MS);
      await expect(pending).resolves.toMatchObject({
        identity: { kind: "oia1", assertion: "QUJDRA==" },
      });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(fetchImpl.mock.calls[0][1]?.signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
      window.__3TCHED_CONFIG__ = priorConfig;
    }
  });

  it("reports what each identity source answered when none resolves", async () => {
    const priorConfig = window.__3TCHED_CONFIG__;
    window.__3TCHED_CONFIG__ = { door: "https://10.0.0.3:8090", issuer: "http://10.10.0.1:51888" };
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url) === IDENTITY_SELF_PATH) return jsonResponse(404, { error: "none" });
      throw new TypeError("Failed to fetch");
    });
    try {
      await expect(resolveIdentity(fetchImpl as unknown as typeof fetch)).resolves.toBeNull();
      expect(identityPickupReport()).toBe(
        "web server: no identity for this address (404); " +
          "decoy issuer (http://10.10.0.1:51888): no answer (unreachable, or it does not allow this page's origin)",
      );
      // Each resolution starts a fresh report.
      const refused = vi.fn(async () => jsonResponse(403, {}));
      await resolveIdentity(refused as unknown as typeof fetch);
      expect(identityPickupReport()).toBe(
        "web server: refused this device (403); decoy issuer (http://10.10.0.1:51888): refused this device (403)",
      );
    } finally {
      window.__3TCHED_CONFIG__ = priorConfig;
    }
  });

  it("renews a lead time before expiry and never for identities without one", () => {
    const issued = { door: "d", identity: { kind: "oia1" as const, assertion: "QQ==" }, expiresAt: 1_000 };
    expect(renewalDelayMs(issued, 1_000 - RENEW_LEAD_SECONDS - 10)).toBe(10_000);
    expect(renewalDelayMs(issued, 1_000)).toBe(0);
    expect(renewalDelayMs({ door: "d", identity: { kind: "sid1" as const, sealedId: "QQ==" } }, 0)).toBeNull();
  });
});
