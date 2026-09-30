import type { DoorClient } from "../grpc/door";

/** Sealed model_registry methods. Capability from `zcall help model_registry`. */
export const MODEL_REGISTRY = "model_registry";
export const MODEL_REGISTRY_READ = "model_registry.read";

export interface CatalogProvider {
  provider_id: string;
  name?: string | null;
  configured: boolean;
  enabled: boolean;
  status: string;
  error?: string | null;
  /** Router profiles (`family.alias`) this provider can serve on the Control Plane. */
  control_plane_profiles: string[];
}

export interface CatalogModel {
  provider_id: string;
  model_id: string;
  name?: string | null;
  available: boolean;
  context_length?: number | null;
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
  options?: { models?: boolean },
): Promise<{ providers: CatalogProvider[]; models: CatalogModel[] }> {
  return consistentRead(async () => {
    const { result } = await client.call<ListProvidersOutput>(
      MODEL_REGISTRY,
      "list_providers",
      {},
      MODEL_REGISTRY_READ,
    );
    if (!Array.isArray(result.providers)) throw new Error("Model catalog returned an invalid provider list.");
    const providers = result.providers;
    if (options?.models === false) return { providers, models: [] };
    if (!Number.isSafeInteger(result.revision)) throw new Error("Model catalog returned an invalid revision.");

    const models: CatalogModel[] = [];
    for (const provider of providers) {
      if (!provider.configured || !provider.enabled || !provider.provider_id) continue;
      models.push(...await readProviderModels(client, provider.provider_id, result.revision));
    }
    return { providers, models };
  });
}

/** Models stored for one provider. `provider_id` is the Cozo key. */
export async function listProviderModels(client: DoorClient, providerId: string): Promise<CatalogModel[]> {
  return consistentRead(() => readProviderModels(client, providerId));
}

async function readProviderModels(client: DoorClient, providerId: string, revision?: number): Promise<CatalogModel[]> {
  const models: CatalogModel[] = [];
  let after: { provider_id: string; model_id: string } | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { result: listed } = await client.call<ListModelsOutput>(
      MODEL_REGISTRY,
      "list_models",
      { provider_id: providerId, limit: PAGE_LIMIT, ...(after ? { after } : {}) },
      MODEL_REGISTRY_READ,
    );
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
