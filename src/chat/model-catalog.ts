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
}

interface ListModelsOutput {
  models?: CatalogModel[];
  more?: boolean;
}

const PAGE_LIMIT = 500;
const MAX_PAGES = 40;

/**
 * Providers come from the owner's list. Models are whatever the last
 * refresh wrote for each provider. An identity reads its own projection;
 * the list itself is system-wide.
 */
export async function listCatalog(
  client: DoorClient,
  options?: { models?: boolean },
): Promise<{ providers: CatalogProvider[]; models: CatalogModel[] }> {
  const { result } = await client.call<ListProvidersOutput>(
    MODEL_REGISTRY,
    "list_providers",
    {},
    MODEL_REGISTRY_READ,
  );
  const providers = result.providers ?? [];
  if (options?.models === false) return { providers, models: [] };

  const models: CatalogModel[] = [];
  for (const provider of providers) {
    if (!provider.configured || !provider.enabled || !provider.provider_id) continue;
    models.push(...await listProviderModels(client, provider.provider_id));
  }
  return { providers, models };
}

/** Models stored for one provider. `provider_id` is the Cozo key. */
export async function listProviderModels(client: DoorClient, providerId: string): Promise<CatalogModel[]> {
  const models: CatalogModel[] = [];
  let after: { provider_id: string; model_id: string } | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { result: listed } = await client.call<ListModelsOutput>(
      MODEL_REGISTRY,
      "list_models",
      { provider_id: providerId, limit: PAGE_LIMIT, ...(after ? { after } : {}) },
      MODEL_REGISTRY_READ,
    );
    const batch = (listed.models ?? []).filter((model) => model.provider_id === providerId);
    models.push(...batch);
    if (!listed.more || batch.length === 0) break;
    const last = batch[batch.length - 1];
    const next = { provider_id: last.provider_id, model_id: last.model_id };
    if (after && after.provider_id === next.provider_id && after.model_id === next.model_id) break;
    after = next;
  }
  return models;
}
