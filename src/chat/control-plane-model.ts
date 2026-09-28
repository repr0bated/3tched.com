import type { DoorClient } from "../grpc/door";
import type { Elevate } from "./SudoPrompt";

/**
 * The Control Plane model, read and set through the door: the router's
 * `agents.control_plane.model_provider` names one configured provider
 * profile, which owns the model and its wire format. Reading needs the
 * router read grant; setting is tched_router `config_set`, an admitted
 * mutation under the caller's verified session and the router write grant,
 * recorded on the chain. It is a protected task: the caller first obtains a
 * one-time sudo ticket for the exact call (`elevate`).
 */
const TCHED_ROUTER = "tched_router";
const READ = "cap.software.tched-router.router.read@v1";
const WRITE = "cap.software.tched-router.router.write@v1";
export const CONTROL_PLANE_PROVIDER_PATH = "agents.control_plane.model_provider";
const PROFILE = /^providers\.models\.(opencode|anthropic)\.(go_control_plane|go_cp_route_[A-Za-z0-9_]+)\.model$/;

export interface ControlPlaneModelOption {
  /** `family.alias`, the value written to the agent's model_provider. */
  reference: string;
  model: string;
}

interface ConfigListEntry {
  path: string;
  value?: string | null;
}

export async function listControlPlaneModels(client: DoorClient): Promise<ControlPlaneModelOption[]> {
  const { result } = await client.call<{ entries: ConfigListEntry[] }>(
    TCHED_ROUTER,
    "config_list",
    { prefix: "providers.models" },
    READ,
  );
  const options: ControlPlaneModelOption[] = [];
  for (const entry of result.entries ?? []) {
    const match = PROFILE.exec(entry.path);
    if (match && entry.value) options.push({ reference: `${match[1]}.${match[2]}`, model: entry.value });
  }
  return options.sort((a, b) => a.model.localeCompare(b.model) || a.reference.localeCompare(b.reference));
}

export async function currentControlPlaneModel(client: DoorClient): Promise<string> {
  const { result } = await client.call<{ value?: string | null }>(
    TCHED_ROUTER,
    "config_get",
    { path: CONTROL_PLANE_PROVIDER_PATH },
    READ,
  );
  return result.value ?? "";
}

export async function setControlPlaneModel(client: DoorClient, reference: string, elevate?: Elevate): Promise<void> {
  if (!/^(opencode|anthropic)\.go_[A-Za-z0-9_]+$/.test(reference)) {
    throw new Error("Not an OpenCode Go control plane profile.");
  }
  const args = { path: CONTROL_PLANE_PROVIDER_PATH, value: reference };
  if (elevate) await elevate(TCHED_ROUTER, "config_set", args);
  await client.call(TCHED_ROUTER, "config_set", args, WRITE);
}

/** One-time sudo ticket for an exact protected call (elevation plugin). */
export async function authorizeTask(
  client: DoorClient,
  plugin: string,
  method: string,
  args: Record<string, unknown>,
  password: string,
): Promise<void> {
  await client.call("elevation", "authorize_task", { plugin, method, args, password }, "elevation.authorize");
}
