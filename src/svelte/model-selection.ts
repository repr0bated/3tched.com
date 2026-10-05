import type { ProviderOption, RouteSelection } from "../chat/chat-adapter";
export function selectionLabel(
  selection: RouteSelection,
  providers: ProviderOption[],
) {
  const provider = providers.find((entry) => entry.id === selection.providerId);
  const model = provider?.models.find(
    (entry) => entry.id === selection.modelId,
  );
  return `${provider?.label ?? selection.providerId} / ${model?.label ?? selection.modelId}`;
}

export function sameSelection(
  left: RouteSelection | null,
  right: RouteSelection,
) {
  return (
    left?.providerId === right.providerId && left.modelId === right.modelId
  );
}

/** A draft belongs to the catalog; an observed native route may not. */
export function catalogDraft(
  providers: ProviderOption[],
  preferred: RouteSelection | null,
  fallback: RouteSelection,
): RouteSelection {
  const preferredProvider = providers.find(
    (entry) => entry.id === preferred?.providerId,
  );
  if (
    preferredProvider?.models.some((model) => model.id === preferred?.modelId)
  )
    return preferred!;
  if (preferredProvider?.models[0])
    return {
      providerId: preferredProvider.id,
      modelId: preferredProvider.models[0].id,
    };
  const fallbackProvider = providers.find(
    (entry) => entry.id === fallback.providerId,
  );
  if (fallbackProvider?.models.some((model) => model.id === fallback.modelId))
    return fallback;
  const first =
    providers.find((entry) => entry.models.length > 0) ?? providers[0];
  return { providerId: first?.id ?? "", modelId: first?.models[0]?.id ?? "" };
}
