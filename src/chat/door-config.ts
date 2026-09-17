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
 *   2. GET <same origin>/api/identity/self — op-web resolves the human who
 *      arrived over WireGuard from the TCP source address and returns their
 *      own SID1 from the identity sled (the SID1-aware client injection)
 *   3. pasted into the connect gate
 */
import type { DoorIdentity } from "../grpc/door";

/** Same-origin endpoint served by op-web; 404 means "no projected identity". */
export const IDENTITY_SELF_PATH = "/api/identity/self";

export interface ProjectedIdentity {
  door: string;
  identity: DoorIdentity;
  sessionId?: string;
}

export interface RuntimeConfig {
  door?: string;
  identity?: DoorIdentity;
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
 * the connect gate is the fallback in every failure mode.
 */
export async function fetchProjectedIdentity(
  fetchImpl: typeof fetch = fetch,
): Promise<ProjectedIdentity | null> {
  try {
    const response = await fetchImpl(IDENTITY_SELF_PATH, {
      credentials: "same-origin",
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
    return {
      door,
      identity: record.identity,
      sessionId: typeof record.session_id === "string" ? record.session_id : undefined,
    };
  } catch {
    return null;
  }
}
