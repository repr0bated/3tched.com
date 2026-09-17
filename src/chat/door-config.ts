/**
 * Where the door address and identity come from.
 *
 * Door URL, first hit wins:
 *   1. window.__3TCHED_CONFIG__.door   (runtime, injected by the host page)
 *   2. localStorage "3tched.door"      (last address the operator used)
 *   3. import.meta.env.VITE_OPDBUS_DOOR (build-time default)
 *
 * Identity is never read from storage or build config. The credential is
 * pasted (or injected via __3TCHED_CONFIG__.identity by an authenticated host
 * page) and lives in memory for the life of the page.
 */
import type { DoorIdentity } from "../grpc/door";

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
