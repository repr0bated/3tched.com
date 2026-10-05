import type { DoorClient } from "../grpc/door";
import type { RouteSelection } from "./chat-adapter";
import type { CatalogModel } from "./model-catalog";
import type { Elevate } from "./elevation";
import { inferenceEndpointMatches, nativeProfilePath, readDedicatedRoute, readRouterValue, verifiedNativeUri } from "./native-routing";

const TCHED_ROUTER = "tched_router";
const WRITE = "cap.software.tched-router.router.write@v1";
export const CONTROL_PLANE_PROVIDER_PATH = "agents.control_plane.model_provider";

export class ControlPlaneMutationUnconfirmedError extends Error {
  constructor(cause: unknown) {
    super(`The model change could not be confirmed: ${cause instanceof Error ? cause.message : "door response unavailable"}. Refresh before retrying.`);
    this.name = "ControlPlaneMutationUnconfirmedError";
  }
}

/** Read the actual dedicated agent route, then resolve it to a provider key. */
export async function currentControlPlaneModel(client: DoorClient, models: CatalogModel[]): Promise<RouteSelection> {
  const { reference, modelId, uri } = await readDedicatedRoute(client, "control_plane");
  const matches = models.filter((model) => model.available && model.model_id === modelId && model.control_plane_profile === reference && inferenceEndpointMatches(uri, model.inference_url_prefix));
  // Unmapped native selections remain visible as observed, never guessed.
  return { providerId: matches.length === 1 ? matches[0].provider_id : reference, modelId };
}

/** A singleton turn cannot silently use an unmapped or differently billed route. */
export async function verifiedControlPlaneModel(client: DoorClient, models: CatalogModel[]): Promise<RouteSelection> {
  const { reference, modelId, uri } = await readDedicatedRoute(client, "control_plane");
  const matches = models.filter(model => model.available && model.model_id === modelId && model.control_plane_profile === reference && inferenceEndpointMatches(uri, model.inference_url_prefix));
  if (matches.length !== 1) throw new Error("Apply a catalog model with a verified Control Plane profile and inference endpoint before sending a message.");
  return { providerId: matches[0].provider_id, modelId };
}

/**
 * Every mode uses the same provider-keyed Cozo catalog. Per-model profiles
 * are routing metadata, never eligibility filters. Change the dedicated
 * agent reference and actual model in one optimistic patch with an exact
 * sudo ticket. Contracts verified against sealed methods on 2026-09-30.
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
