import type { DoorClient } from "../grpc/door";
import { listCatalog } from "./model-catalog";
import type { Elevate } from "./SudoPrompt";

/**
 * The Control Plane model, read and set through the door: the router's
 * `agents.control_plane.model_provider` names one configured provider
 * profile, which owns the model and its wire format. The choices are the
 * profiles on the shared provider list. Setting is tched_router `config_set`,
 * an admitted mutation under the caller's verified session and the router
 * write grant, recorded on the chain. It is a protected task: the caller
 * first obtains a one-time sudo ticket for the exact call (`elevate`).
 */
const TCHED_ROUTER = "tched_router";
const READ = "cap.software.tched-router.router.read@v1";
const WRITE = "cap.software.tched-router.router.write@v1";
export const CONTROL_PLANE_PROVIDER_PATH = "agents.control_plane.model_provider";
/** `family.alias` for a router family the provider list may name. */
const PROFILE_REF =
  /^(anthropic|custom|deepseek|gemini|groq|ollama|openai|opencode|openrouter|xai)\.[a-z][a-z0-9_]{0,63}$/;

export interface ControlPlaneModelOption {
  /** `family.alias`, the value written to the agent's model_provider. */
  reference: string;
  model: string;
}

export async function listControlPlaneModels(client: DoorClient): Promise<ControlPlaneModelOption[]> {
  const { providers } = await listCatalog(client, { models: false });
  const options: ControlPlaneModelOption[] = [];
  for (const provider of providers) {
    if (!provider.configured || !provider.enabled) continue;
    const label = provider.name?.trim() || provider.provider_id;
    for (const reference of provider.control_plane_profiles ?? []) {
      if (!PROFILE_REF.test(reference)) continue;
      options.push({ reference, model: label });
    }
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
  if (!PROFILE_REF.test(reference)) {
    throw new Error("Not a control plane provider profile.");
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
