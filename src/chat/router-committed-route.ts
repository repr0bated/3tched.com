import type { DoorClient } from "../grpc/door";
import type { RouteSelection } from "./chat-adapter";
import type { CatalogModel, CatalogProvider } from "./model-catalog";
import { resolveCatalogModelBinding } from "./native-routing";

const ROUTER_STATE_READ = "cap.software.3tched-router.state.read@v1";

interface ObservedRouterState {
  selected_provider?: string;
  selected_model?: string;
}

/** Native router family from a catalog provider row or model binding reference. */
export function nativeFamilyFromCatalog(
  provider: CatalogProvider,
  model?: CatalogModel,
): string | null {
  const reference = model?.native_provider_id ?? provider.native_provider_id;
  if (reference?.includes(".")) {
    const [family] = reference.split(".", 2);
    if (family) return family;
  }
  return provider.provider_id || null;
}

/**
 * Map authoritative D-Bus-projected router selection to one catalog row.
 * Fails closed when the observation does not identify a unique catalog model.
 */
export function mapObservedRouterToCatalog(
  observed: ObservedRouterState,
  providers: CatalogProvider[],
  models: CatalogModel[],
): RouteSelection | null {
  const family = observed.selected_provider?.trim();
  const modelId = observed.selected_model?.trim();
  if (!family || !modelId) return null;

  const candidates = models.filter(
    (row) =>
      row.available &&
      row.model_id === modelId &&
      providers.some(
        (provider) =>
          provider.provider_id === row.provider_id &&
          provider.configured &&
          provider.enabled,
      ),
  );
  if (!candidates.length) return null;

  const byFamily = candidates.filter((row) => {
    const provider = providers.find((entry) => entry.provider_id === row.provider_id);
    if (!provider) return false;
    const rowFamily = nativeFamilyFromCatalog(provider, row);
    return rowFamily === family || provider.provider_id === family;
  });

  const matches = byFamily.length > 0 ? byFamily : candidates;
  if (matches.length !== 1) return null;

  return { providerId: matches[0].provider_id, modelId: matches[0].model_id };
}

/**
 * Read committed router selection through the door (D-Bus-backed CallMethod)
 * before falling back to catalog ordering for the picker UI.
 */
export async function loadCommittedCatalogRoute(
  client: DoorClient,
  providers: CatalogProvider[],
  models: CatalogModel[],
): Promise<{ selection: RouteSelection; bindingConfirmed: boolean } | null> {
  const { result } = await client.call<{ state?: ObservedRouterState }>(
    "tched_router",
    "GetState",
    {},
    ROUTER_STATE_READ,
  );
  const selection = mapObservedRouterToCatalog(result.state ?? {}, providers, models);
  if (!selection) return null;

  const model = models.find(
    (row) => row.provider_id === selection.providerId && row.model_id === selection.modelId,
  );
  if (!model?.inference_url_prefix) {
    return { selection, bindingConfirmed: false };
  }

  try {
    const binding = await resolveCatalogModelBinding(
      client,
      selection.providerId,
      selection.modelId,
      model.inference_url_prefix,
    );
    return {
      selection,
      bindingConfirmed: binding.model === selection.modelId,
    };
  } catch {
    return { selection, bindingConfirmed: false };
  }
}
