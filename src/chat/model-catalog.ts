import { DoorError, type DoorClient } from "../grpc/door";

/** Sealed model_registry methods. Capability from `zcall help model_registry`. */
export const MODEL_REGISTRY = "model_registry";
export const MODEL_REGISTRY_READ = "model_registry.read";
/** Verified from the mounted model_registry/operations/refresh declaration. */
export const MODEL_REGISTRY_REFRESH = "model_registry.refresh";

export interface CatalogProvider {
  provider_id: string;
  /** Exact ordinary native routing reference; provider_id remains the Cozo key. */
  native_provider_id?: string | null;
  /** Explicit native inference endpoint prefix, independent of models_url. */
  inference_url_prefix?: string | null;
  name?: string | null;
  configured: boolean;
  enabled: boolean;
  status: string;
  error?: string | null;
  /** Native routing metadata; never a filter on the shared model list. */
  control_plane_profiles: string[];
  /** Authentication method expected by this provider (api_key, oauth2, none, etc.) */
  auth?: string | null;
  /** Service endpoint URL, when the provider is remote */
  endpoint?: string | null;
  /** SDK or package name that implements this provider */
  sdk?: string | null;
}

export interface CatalogModel {
  provider_id: string;
  model_id: string;
  /** Model-owned ordinary family.alias binding; no inference from provider metadata. */
  native_provider_id?: string | null;
  /** Model-owned endpoint authority; absent metadata never permits inference. */
  inference_url_prefix?: string | null;
  name?: string | null;
  available: boolean;
  context_length?: number | null;
  /** Observed routing binding, not model eligibility or a grant. */
  control_plane_profile?: string | null;
  recorded_profile?: string | null;
  /** Authentication method expected by this provider (api_key, oauth2, none, etc.) */
  auth?: string | null;
  /** Service endpoint URL, when the provider is remote */
  endpoint?: string | null;
  /** SDK or package name that implements this provider */
  sdk?: string | null;
}

interface ListProvidersOutput {
  providers?: CatalogProvider[];
  revision?: number;
}

interface ListModelsOutput {
  models?: CatalogModel[];
  more?: boolean;
  revision?: number;
}

interface RefreshOutput {
  refreshed_at: string;
  revision: number;
  providers: { provider_id: string; status: string; error?: string | null }[];
}

/** Refresh once through the admitted plugin, then read its committed catalog.
 * A provider failure or refused refresh can leave readable stored choices.
 * Do not retry the mutation, including when its outcome is unknown. */
export async function refreshCatalog(client: DoorClient, assertCurrent?: () => void) {
  assertCurrent?.();
  let refreshError: string | null = null;
  try {
    const { result } = await client.call<RefreshOutput>(
      MODEL_REGISTRY,
      "refresh",
      {},
      MODEL_REGISTRY_REFRESH,
      // The backend admits up to 32 providers in batches of four, with a
      // 30-second provider deadline. Keep one bounded request for the batch.
      { timeoutMs: 300_000 },
    );
    assertCurrent?.();
    if (!Array.isArray(result?.providers) || !Number.isSafeInteger(result.revision) ||
        typeof result.refreshed_at !== "string" || result.providers.some(provider =>
          !provider || typeof provider.provider_id !== "string" ||
          !["ok", "error", "removed"].includes(provider.status))) {
      throw new Error("Model refresh returned an invalid result.");
    }
    const failed = result.providers.filter(provider => provider.status === "error");
    if (failed.length) {
      refreshError = `Could not refresh ${failed.map(provider => provider.provider_id).join(", ")}. Showing stored models for those providers.`;
    }
  } catch (error) {
    if (error instanceof DoorError && ["UNAUTHENTICATED", "CANCELLED"].includes(error.code)) throw error;
    const detail = error instanceof DoorError ? error.statusDetail : undefined;
    const message = detail?.startsWith("method_outcome_unknown;") ? detail
      : error instanceof Error ? error.message : "Model refresh failed.";
    refreshError = `${message} Showing stored models; freshness is unconfirmed.`;
  }
  assertCurrent?.();
  return { ...await listCatalog(client, { assertCurrent }), refreshError };
}

const PAGE_LIMIT = 500;
const MAX_PAGES = 40;
const MAX_READ_ATTEMPTS = 3;

class CatalogChanged extends Error {
  constructor() {
    super("Model catalog changed while reading. Refresh models again.");
  }
}

async function consistentRead<T>(read: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await read();
    } catch (error) {
      if (!(error instanceof CatalogChanged) || attempt === MAX_READ_ATTEMPTS) throw error;
    }
  }
}

/**
 * Providers come from the owner's list. Models are whatever the last
 * refresh wrote for each provider. An identity reads its own projection;
 * the list itself is system-wide.
 */
export async function listCatalog(
  client: DoorClient,
  options?: { models?: boolean; assertCurrent?: () => void },
): Promise<{ providers: CatalogProvider[]; models: CatalogModel[] }> {
  return consistentRead(async () => {
    options?.assertCurrent?.();
    const { result } = await client.call<ListProvidersOutput>(
      MODEL_REGISTRY,
      "list_providers",
      {},
      MODEL_REGISTRY_READ,
    );
    options?.assertCurrent?.();
    if (!Array.isArray(result.providers)) throw new Error("Model catalog returned an invalid provider list.");
    const providers = result.providers;
    if (options?.models === false) return { providers, models: [] };
    if (!Number.isSafeInteger(result.revision)) throw new Error("Model catalog returned an invalid revision.");

    const models: CatalogModel[] = [];
    for (const provider of providers) {
      if (!provider.configured || !provider.enabled || !provider.provider_id) continue;
      models.push(...await readProviderModels(client, provider.provider_id, result.revision, options?.assertCurrent));
    }
    return { providers, models };
  });
}

/** Models stored for one provider. `provider_id` is the Cozo key. */
export async function listProviderModels(client: DoorClient, providerId: string): Promise<CatalogModel[]> {
  return consistentRead(() => readProviderModels(client, providerId));
}

async function readProviderModels(client: DoorClient, providerId: string, revision?: number, assertCurrent?: () => void): Promise<CatalogModel[]> {
  const models: CatalogModel[] = [];
  let after: { provider_id: string; model_id: string } | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    assertCurrent?.();
    const { result: listed } = await client.call<ListModelsOutput>(
      MODEL_REGISTRY,
      "list_models",
      { provider_id: providerId, limit: PAGE_LIMIT, ...(after ? { after } : {}) },
      MODEL_REGISTRY_READ,
    );
    assertCurrent?.();
    if (!Array.isArray(listed.models) || typeof listed.more !== "boolean" || !Number.isSafeInteger(listed.revision)) {
      throw new Error("Model catalog returned an invalid model page.");
    }
    if (revision !== undefined && listed.revision !== revision) throw new CatalogChanged();
    revision = listed.revision;
    const batch = listed.models;
    let previous = after?.model_id;
    for (const model of batch) {
      if (model.provider_id !== providerId || typeof model.model_id !== "string" || !model.model_id ||
          (previous !== undefined && model.model_id <= previous)) {
        throw new Error("Model catalog returned an invalid pagination cursor.");
      }
      previous = model.model_id;
    }
    models.push(...batch);
    if (!listed.more) return models;
    if (batch.length === 0) throw new Error("Model catalog pagination made no progress.");
    const last = batch[batch.length - 1];
    const next = { provider_id: last.provider_id, model_id: last.model_id };
    after = next;
  }
  throw new Error("Model catalog exceeds the 20,000-model provider read limit.");
}
