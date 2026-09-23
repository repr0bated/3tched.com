/**
 * Where the door address and identity come from.
 *
 * Door URL, first hit wins:
 *   1. window.__3TCHED_CONFIG__.door   (runtime, injected by the host page)
 *   2. localStorage "3tched.door"      (last address the operator used)
 *   3. import.meta.env.VITE_OPDBUS_DOOR (build-time default)
 *
 * Identity is never read from storage or build config. It arrives one of
 * three ways, in this order, and lives in memory for the life of the page:
 *   1. window.__3TCHED_CONFIG__.identity injected by an authenticated host page
 *   2. GET <same origin>/api/identity/self — op-web resolves a local human
 *      from the TCP source address and returns their own SID1 from the
 *      identity sled (the SID1-aware client injection)
 *   3. GET <issuer>/identity/self — the decoy that terminated this human's
 *      WireGuard tunnel mints a short-lived OIA1 for the kernel-verified peer
 *      (the OIA1 pickup). The page fetches it over the tunnel and carries it
 *      unchanged to the door to resolve its session. A second fresh assertion
 *      reads that session's existing SID1; chat then uses the returned SID1.
 *      Issuer URL: window.__3TCHED_CONFIG__.issuer, then VITE_OPDBUS_ISSUER.
 */
import type { DoorIdentity } from "../grpc/door";

/** Same-origin endpoint served by op-web; 404 means "no projected identity". */
export const IDENTITY_SELF_PATH = "/api/identity/self";

export interface ProjectedIdentity {
  door: string;
  identity: DoorIdentity;
  sessionId?: string;
  /** Unix seconds; present for issued OIA1 assertions, absent for SID1. */
  expiresAt?: number;
}

export interface RuntimeConfig {
  door?: string;
  identity?: DoorIdentity;
  /** Origin of the decoy issuer reachable over this human's tunnel. */
  issuer?: string;
}

/** Path on the decoy issuer that serves the OIA1 pickup. */
export const ISSUER_IDENTITY_PATH = "/identity/self";

/** Renew an issued assertion this many seconds before it expires. */
export const RENEW_LEAD_SECONDS = 60;

/** Issuer origin: runtime config first, then the build-time default. */
export function issuerUrl(): string | undefined {
  const fromRuntime = runtimeConfig().issuer;
  if (typeof fromRuntime === "string" && fromRuntime.trim()) return fromRuntime.trim().replace(/\/+$/, "");
  const fromEnv = (import.meta.env.VITE_OPDBUS_ISSUER as string | undefined)?.trim();
  return fromEnv ? fromEnv.replace(/\/+$/, "") : undefined;
}

declare global {
  interface Window {
    __3TCHED_CONFIG__?: RuntimeConfig;
  }
}

const DOOR_STORAGE_KEY = "3tched.door";

function runtimeConfig(): RuntimeConfig {
  if (typeof window === "undefined") return {};
  return window.__3TCHED_CONFIG__ ?? {};
}

export function defaultDoorUrl(): string {
  const fromRuntime = runtimeConfig().door?.trim();
  if (fromRuntime) return fromRuntime;
  try {
    const stored = localStorage.getItem(DOOR_STORAGE_KEY)?.trim();
    if (stored) return stored;
  } catch {
    // storage unavailable
  }
  const fromEnv = (import.meta.env.VITE_OPDBUS_DOOR as string | undefined)?.trim();
  return fromEnv ?? "";
}

export function rememberDoorUrl(url: string): void {
  try {
    localStorage.setItem(DOOR_STORAGE_KEY, url);
  } catch {
    // storage unavailable
  }
}

export function injectedIdentity(): DoorIdentity | undefined {
  const identity = runtimeConfig().identity;
  if (!identity) return undefined;
  if (identity.kind === "oia1" && identity.assertion) return identity;
  if (identity.kind === "sid1" && identity.sealedId) return identity;
  return undefined;
}

function isDoorIdentity(value: unknown): value is DoorIdentity {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    (record.kind === "sid1" && typeof record.sealedId === "string" && record.sealedId.length > 0) ||
    (record.kind === "oia1" && typeof record.assertion === "string" && record.assertion.length > 0)
  );
}

/**
 * Ask the page's own origin who this WireGuard arrival is. Resolves to null
 * (never throws) when the endpoint is absent, refuses, or answers nonsense, so
 * the retry panel is shown when identity resolution fails.
 */
export async function fetchProjectedIdentity(
  fetchImpl: typeof fetch = fetch,
): Promise<ProjectedIdentity | null> {
  return fetchIdentityDocument(fetchImpl, IDENTITY_SELF_PATH, { credentials: "same-origin" });
}

/**
 * Ask the decoy issuer, over this human's own tunnel, for a fresh OIA1. Null
 * when no issuer is configured, when it refuses (no verified peer for the
 * source), or when the answer is not an identity document — the next source
 * in the chain takes over, or the retry panel is shown.
 */
export async function fetchIssuedIdentity(
  fetchImpl: typeof fetch = fetch,
  issuer: string | undefined = issuerUrl(),
): Promise<ProjectedIdentity | null> {
  const origin = issuer?.trim().replace(/\/+$/, "");
  if (!origin) return null;
  return fetchIdentityDocument(fetchImpl, `${origin}${ISSUER_IDENTITY_PATH}`, {
    mode: "cors",
    credentials: "omit",
  });
}

/**
 * The full resolution chain (injected → same origin → issuer). Never throws;
 * null means "show the identity retry panel".
 */
export async function resolveIdentity(fetchImpl: typeof fetch = fetch): Promise<ProjectedIdentity | null> {
  const injected = injectedIdentity();
  const door = defaultDoorUrl();
  if (injected && door) return { door, identity: injected };
  return (await fetchProjectedIdentity(fetchImpl)) ?? (await fetchIssuedIdentity(fetchImpl));
}

/** Milliseconds until an issued identity should be renewed; null if it never expires. */
export function renewalDelayMs(identity: ProjectedIdentity, nowSeconds: number = Date.now() / 1000): number | null {
  if (typeof identity.expiresAt !== "number") return null;
  return Math.max(0, (identity.expiresAt - RENEW_LEAD_SECONDS - nowSeconds) * 1000);
}

async function fetchIdentityDocument(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<ProjectedIdentity | null> {
  try {
    const response = await fetchImpl(url, {
      ...init,
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (!body || typeof body !== "object") return null;
    const record = body as Record<string, unknown>;
    if (!isDoorIdentity(record.identity)) return null;
    const door = typeof record.door === "string" && record.door.trim() ? record.door.trim() : defaultDoorUrl();
    if (!door) return null;
    const expiresAt =
      typeof record.expires_at === "number" && Number.isFinite(record.expires_at) ? record.expires_at : undefined;
    return {
      door,
      identity: record.identity,
      sessionId: typeof record.session_id === "string" ? record.session_id : undefined,
      expiresAt,
    };
  } catch {
    return null;
  }
}
