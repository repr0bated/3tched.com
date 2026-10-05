import { describe, expect, it } from "vitest";
import { mapObservedRouterToCatalog, nativeFamilyFromCatalog } from "./router-committed-route";
import type { CatalogModel, CatalogProvider } from "./model-catalog";

const providers: CatalogProvider[] = [
  {
    provider_id: "salad",
    native_provider_id: "custom.salad",
    configured: true,
    enabled: true,
    status: "ok",
    control_plane_profiles: [],
  },
  {
    provider_id: "openai",
    native_provider_id: "openai.personal",
    configured: true,
    enabled: true,
    status: "ok",
    control_plane_profiles: [],
  },
];

const models: CatalogModel[] = [
  {
    provider_id: "salad",
    model_id: "qwen3.5-35b-a3b",
    available: true,
    native_provider_id: "custom.salad",
    inference_url_prefix: "https://inference.example/salad/v1",
  },
  {
    provider_id: "openai",
    model_id: "gpt-5",
    available: true,
    native_provider_id: "openai.personal",
    inference_url_prefix: "https://api.openai.com/v1",
  },
];

describe("mapObservedRouterToCatalog", () => {
  it("maps native family and model to the unique catalog row", () => {
    expect(
      mapObservedRouterToCatalog(
        { selected_provider: "custom", selected_model: "qwen3.5-35b-a3b" },
        providers,
        models,
      ),
    ).toEqual({ providerId: "salad", modelId: "qwen3.5-35b-a3b" });
  });

  it("returns null when the observation is ambiguous across providers", () => {
    const ambiguousProviders: CatalogProvider[] = [
      ...providers,
      {
        provider_id: "other",
        native_provider_id: "custom.other",
        configured: true,
        enabled: true,
        status: "ok",
        control_plane_profiles: [],
      },
    ];
    const ambiguous: CatalogModel[] = [
      ...models,
      {
        provider_id: "other",
        model_id: "qwen3.5-35b-a3b",
        available: true,
        native_provider_id: "custom.other",
        inference_url_prefix: "https://inference.example/other/v1",
      },
    ];
    expect(
      mapObservedRouterToCatalog(
        { selected_provider: "custom", selected_model: "qwen3.5-35b-a3b" },
        ambiguousProviders,
        ambiguous,
      ),
    ).toBeNull();
  });

  it("derives native family from provider metadata", () => {
    expect(nativeFamilyFromCatalog(providers[1], models[1])).toBe("openai");
  });
});
