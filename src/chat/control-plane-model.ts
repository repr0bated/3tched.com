import type { DoorClient } from "../grpc/door";
import type { RouteSelection } from "./chat-adapter";
import type { CatalogModel } from "./model-catalog";
import type { Elevate } from "./elevation";
import { assertInferenceEndpoint, inferenceEndpointMatches, nativeProfilePath, readDedicatedRoute, readRouterValue, validateDedicatedRoute, verifiedNativeUri } from "./native-routing";

const TCHED_ROUTER = "chat_router";
const WRITE = "cap.software.tched-router.router.write@v1";
export const CONTROL_PLANE_PROVIDER_PATH = "agents.control_plane.model_provider";

export type ControlPlaneModelAccess = "self" | "admin";

/** chat_router no longer seals the own-route operations
 * (`get_own_agent_route_access`/`apply_own_agent_route`), so every identity
 * uses the protected administration path. The server still checks canonical
 * identity, current $ROOT, mode and exact grant. */
export async function controlPlaneModelAccess(_client: DoorClient): Promise<ControlPlaneModelAccess> {
  return "admin";
}

export class ControlPlaneMutationUnconfirmedError extends Error {
  constructor(cause: unknown) {
    super(`The model change could not be confirmed: ${cause instanceof Error ? cause.message : "door response unavailable"}. Refresh before retrying.`);
    this.name = "ControlPlaneMutationUnconfirmedError";
  }
}

/** Read the actual dedicated agent route, then resolve it to a provider key. */
export async function currentControlPlaneModel(client: DoorClient, models: CatalogModel[], own?: boolean): Promise<RouteSelection> {
  const { reference, modelId, uri } = await readDedicatedRoute(client, "control_plane", own);
  const matches = models.filter((model) => model.available && model.model_id === modelId && model.control_plane_profile === reference && inferenceEndpointMatches(uri, model.inference_url_prefix));
  // Unmapped native selections remain visible as observed, never guessed.
  return { providerId: matches.length === 1 ? matches[0].provider_id : reference, modelId };
}

/**
 * Every mode uses the same provider-keyed Cozo catalog. The configured chatbot
 * uses its bounded own-model operation without elevation; other identities keep
 * the protected administration path. New methods require a matching reseal.
 */
export async function setControlPlaneModel(
  client: DoorClient,
  selection: RouteSelection,
  models: CatalogModel[],
  elevate: Elevate,
): Promise<void> {
  const model = models.find((row) => row.provider_id === selection.providerId && row.model_id === selection.modelId);
  if (!model) throw new Error("That provider/model is no longer in the catalog. Refresh models.");
  if (!model.available) throw new Error("That catalog model is unavailable. Refresh models and choose an available model.");
  const reference = model.control_plane_profile;
  if (!reference) {
    throw new Error(`The catalog has no native routing binding for ${selection.providerId} / ${selection.modelId}.`);
  }
  const path = nativeProfilePath(reference, "model");
  const access = await controlPlaneModelAccess(client);
  if (access === "self") {
    try {
      const { result } = await client.call<{
        mode?: unknown; reference?: unknown; model?: unknown; uri?: unknown;
      }>(
        TCHED_ROUTER, "apply_own_agent_route",
        { provider_id: selection.providerId, model_id: selection.modelId },
        "cap.software.tched-router.agent.route.self.write@v1",
      );
      const applied = validateDedicatedRoute(result, "control_plane");
      if (applied.reference !== reference || applied.modelId !== selection.modelId) {
        throw new Error("The applied Control Plane route differs from the selected catalog model.");
      }
      assertInferenceEndpoint(applied.uri, model.inference_url_prefix);
      return;
    } catch (cause) {
      // No administrative fallback: a denial or lost response cannot turn the
      // scoped request into an unrelated broad configuration mutation.
      throw new ControlPlaneMutationUnconfirmedError(cause);
    }
  }
  const [currentReference, currentModel, uri] = await Promise.all([
    readRouterValue(client, CONTROL_PLANE_PROVIDER_PATH),
    readRouterValue(client, path),
    verifiedNativeUri(client, reference, model.inference_url_prefix),
  ]);
  if (currentReference === reference && currentModel === selection.modelId) return;
  const providerPointer = "/agents/control_plane/model_provider";
  const modelPointer = `/${path.replaceAll(".", "/")}`;
  const args = { operations: [
    { op: "test", path: providerPointer, value: currentReference },
    { op: "test", path: modelPointer, value: currentModel },
    { op: "test", path: `/${nativeProfilePath(reference, "uri").replaceAll(".", "/")}`, value: uri },
    { op: "replace", path: modelPointer, value: selection.modelId },
    { op: "replace", path: providerPointer, value: reference },
  ] };
  await elevate(TCHED_ROUTER, "config_patch", args);
  try {
    await client.call(TCHED_ROUTER, "config_patch", args, WRITE);
  } catch (cause) {
    // A lost response may follow an accepted write. Reconcile before retry;
    // preflight and elevation failures never reach this branch.
    throw new ControlPlaneMutationUnconfirmedError(cause);
  }
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
