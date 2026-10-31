import type { DoorClient } from "../grpc/door";

const ROUTER_READ = "cap.software.tched-router.router.read@v1";
const CATALOG_BINDING_READ = "cap.software.tched-router.model.binding.read@v1";
const NATIVE_PROVIDER_REF = /^[a-z][a-z0-9_-]*\.[a-z][a-z0-9_-]*$/;

export interface ResolvedCatalogBinding {
  providerId: string;
  modelId: string;
  reference: string;
  model: string;
  uri: string;
  oauth: boolean;
  catalogRevision: number;
}

export function nativeProfilePath(reference: string, field: "model" | "uri"): string {
  if (!NATIVE_PROVIDER_REF.test(reference)) throw new Error("The catalog contains an invalid native routing binding; expected family.alias.");
  return `providers.models.${reference}.${field}`;
}

export async function readRouterValue(client: DoorClient, path: string): Promise<string> {
  const { result } = await client.call<{ value?: string | null }>("chat_router", "config_get", { path }, ROUTER_READ);
  if (typeof result.value !== "string" || !result.value.trim()) throw new Error(`The router has no configured value for ${path}.`);
  return result.value;
}

function endpoint(value: unknown, label: string): URL {
  if (typeof value !== "string" || !value || value.trim() !== value) throw new Error(`${label} must be an explicit credential-free HTTPS URL.`);
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`${label} must be an explicit credential-free HTTPS URL.`); }
  if (url.protocol !== "https:" || url.username || url.password || value.includes("?") || value.includes("#") || value.includes("\\") || /%(?:2f|5c)/i.test(url.pathname)) {
    throw new Error(`${label} must be a credential-free HTTPS URL without query, fragment or escaped path separators.`);
  }
  return url;
}

/** Compare explicit endpoint authority, including a complete path segment boundary. */
export function assertInferenceEndpoint(uri: unknown, prefix: unknown): void {
  const allowed = endpoint(prefix, "The model's inference_url_prefix");
  const actual = endpoint(uri, "The native inference URI");
  const path = allowed.pathname.replace(/\/+$/, "") || "/";
  if (actual.origin !== allowed.origin || (path !== "/" && actual.pathname !== path && !actual.pathname.startsWith(`${path}/`))) {
    throw new Error("The native inference URI does not match the model's inference_url_prefix. Configure the intended subscription endpoint before Apply.");
  }
}

export function inferenceEndpointMatches(uri: string, prefix: unknown): boolean {
  try { assertInferenceEndpoint(uri, prefix); return true; } catch { return false; }
}

/** Read only the exact native profile; no family/provider/CP fallback. */
export async function verifiedNativeUri(client: DoorClient, reference: string, prefix: unknown): Promise<string> {
  endpoint(prefix, "The model's inference_url_prefix");
  const uri = await readRouterValue(client, nativeProfilePath(reference, "uri"));
  assertInferenceEndpoint(uri, prefix);
  return uri;
}

/** Resolve one catalog model against the router's current native profile inventory. */
export async function resolveCatalogModelBinding(
  client: DoorClient,
  providerId: string,
  modelId: string,
  inferenceUrlPrefix: unknown,
): Promise<ResolvedCatalogBinding> {
  const { result } = await client.call<{
    provider_id?: unknown;
    model_id?: unknown;
    reference?: unknown;
    model?: unknown;
    uri?: unknown;
    oauth?: unknown;
    catalog_revision?: unknown;
  }>(
    "chat_router",
    "resolve_catalog_model_binding",
    { provider_id: providerId, model_id: modelId },
    CATALOG_BINDING_READ,
  );
  return validateCatalogBinding(result, providerId, modelId, inferenceUrlPrefix);
}

/** Apply only the backend's private ordinary-route binding, with exact preflight readback. */
export async function applyCatalogModelBinding(
  client: DoorClient,
  providerId: string,
  modelId: string,
  inferenceUrlPrefix: unknown,
  expected?: ResolvedCatalogBinding,
): Promise<ResolvedCatalogBinding> {
  const { result } = await client.call<{
    provider_id?: unknown; model_id?: unknown; reference?: unknown; model?: unknown; uri?: unknown; oauth?: unknown; catalog_revision?: unknown;
  }>(
    "chat_router",
    "apply_catalog_model_binding",
    { provider_id: providerId, model_id: modelId },
    "cap.software.tched-router.catalog.selection.set@v1",
  );
  const applied = validateCatalogBinding(result, providerId, modelId, inferenceUrlPrefix);
  if (expected && (!sameCatalogModelBinding(expected, applied) || expected.catalogRevision !== applied.catalogRevision)) {
    throw new Error("Change outcome unknown; applied native route differs from its preflight catalog binding. Refresh before retrying.");
  }
  return applied;
}

function validateCatalogBinding(
  result: { provider_id?: unknown; model_id?: unknown; reference?: unknown; model?: unknown; uri?: unknown; oauth?: unknown; catalog_revision?: unknown },
  providerId: string,
  modelId: string,
  inferenceUrlPrefix: unknown,
): ResolvedCatalogBinding {
  if (result.provider_id !== providerId || result.model_id !== modelId) throw new Error("The router resolved a different catalog provider or model. Refresh models before applying.");
  if (typeof result.reference !== "string") throw new Error("The router has no exact native profile binding for this catalog model.");
  nativeProfilePath(result.reference, "model");
  if (result.model !== modelId) throw new Error("The resolved native profile model differs from the selected catalog model.");
  if (result.oauth !== undefined && typeof result.oauth !== "boolean") throw new Error("The router returned invalid native authentication metadata.");
  const oauth = result.oauth === true;
  if (oauth) {
    if (!result.reference.startsWith("openai.") || result.uri !== "") throw new Error("The router returned an invalid subscription-native binding.");
  } else assertInferenceEndpoint(result.uri, inferenceUrlPrefix);
  if (!Number.isSafeInteger(result.catalog_revision) || (result.catalog_revision as number) < 0) throw new Error("The router returned an invalid catalog revision for the native binding.");
  return { providerId, modelId, reference: result.reference, model: result.model, uri: result.uri as string, oauth, catalogRevision: result.catalog_revision as number };
}

/** Compare binding identity and endpoint while allowing unrelated catalog rows to refresh. */
export function sameCatalogModelBinding(left: ResolvedCatalogBinding, right: ResolvedCatalogBinding): boolean {
  return left.providerId === right.providerId &&
    left.modelId === right.modelId &&
    left.reference === right.reference &&
    left.model === right.model &&
    left.uri === right.uri && left.oauth === right.oauth;
}

export function validateDedicatedRoute(
  result: { mode?: unknown; reference?: unknown; model?: unknown; uri?: unknown },
  role: "control_plane" | "accountability",
) {
  if (result.mode !== role) throw new Error("The door returned a different dedicated agent mode. Refresh again.");
  if (typeof result.reference !== "string") throw new Error("The dedicated agent has no configured native profile.");
  nativeProfilePath(result.reference, "model");
  if (typeof result.model !== "string" || !result.model.trim() || result.model.trim() !== result.model) throw new Error("The dedicated agent has no configured model.");
  endpoint(result.uri, "The native inference URI");
  return { reference: result.reference, modelId: result.model, uri: result.uri as string };
}

export async function readDedicatedRoute(client: DoorClient, role: "control_plane" | "accountability", own = client.isBoundOracle) {
  if (own) {
    const { result } = await client.call<{ mode: string; reference: string; model: string; uri: string }>(
      "chat_router", "get_own_agent_route", {}, "cap.software.tched-router.agent.route.self.read@v1",
    );
    return validateDedicatedRoute(result, role);
  }
  const path = `agents.${role}.model_provider`;
  const reference = await readRouterValue(client, path);
  const [modelId, uri] = await Promise.all([
    readRouterValue(client, nativeProfilePath(reference, "model")),
    readRouterValue(client, nativeProfilePath(reference, "uri")),
  ]);
  const [confirmedModel, confirmedUri] = await Promise.all([
    readRouterValue(client, nativeProfilePath(reference, "model")),
    readRouterValue(client, nativeProfilePath(reference, "uri")),
  ]);
  if (await readRouterValue(client, path) !== reference || confirmedModel !== modelId || confirmedUri !== uri) throw new Error(`The ${role === "control_plane" ? "Control Plane" : "Accountability"} selection changed while reading. Refresh again.`);
  return { reference, modelId, uri };
}

