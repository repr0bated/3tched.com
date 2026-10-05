import { describe, expect, it, vi } from "vitest";
import type { DoorClient } from "../grpc/door";
import { listCatalog, listProviderModels } from "./model-catalog";

const provider = { provider_id: "vendor", configured: true, enabled: true, status: "ok", control_plane_profiles: ["custom.control_plane"] };
const model = (id: string) => ({ provider_id: "vendor", model_id: id, available: true });
function clientWith(call: ReturnType<typeof vi.fn>) {
  return { call } as unknown as DoorClient;
}

describe("model catalog", () => {
  it("preserves native metadata separately from the Cozo provider/model keys", async () => {
    const nativeProvider = { ...provider, native_provider_id: "native-family.provider_default" };
    const nativeModel = { ...model("vendor/model"), native_provider_id: "native-family.model_override" };
    const call = vi.fn()
      .mockResolvedValueOnce({ result: { providers: [nativeProvider], revision: 1 } })
      .mockResolvedValueOnce({ result: { models: [nativeModel], more: false, revision: 1 } });
    expect(await listCatalog(clientWith(call))).toEqual({ providers: [nativeProvider], models: [nativeModel] });
    expect(call.mock.calls[1][2]).toEqual({ provider_id: "vendor", limit: 500 });
  });

  it("reads every page with the provider and actual model cursor", async () => {
    const first = Array.from({ length: 500 }, (_, i) => model(`model-${String(i).padStart(4, "0")}`));
    const call = vi.fn().mockResolvedValueOnce({ result: { models: first, more: true, revision: 7 } })
      .mockResolvedValueOnce({ result: { models: [model("model-0500")], more: false, revision: 7 } });
    const models = await listProviderModels(clientWith(call), "vendor");
    expect(models).toHaveLength(501);
    expect(call.mock.calls[1]).toEqual(["model_registry", "list_models", {
      provider_id: "vendor", limit: 500, after: { provider_id: "vendor", model_id: "model-0499" },
    }, "model_registry.read"]);
    expect(models.some(m => m.model_id === "custom.control_plane")).toBe(false);
  });

  it("restarts the whole lookup when cron refresh changes its revision", async () => {
    const call = vi.fn()
      .mockResolvedValueOnce({ result: { providers: [provider], revision: 1 } })
      .mockResolvedValueOnce({ result: { models: [model("old")], more: true, revision: 1 } })
      .mockResolvedValueOnce({ result: { models: [model("new")], more: false, revision: 2 } })
      .mockResolvedValueOnce({ result: { providers: [provider], revision: 2 } })
      .mockResolvedValueOnce({ result: { models: [model("new")], more: false, revision: 2 } });
    expect(await listCatalog(clientWith(call))).toEqual({ providers: [provider], models: [model("new")] });
    expect(call.mock.calls[4][2]).toEqual({ provider_id: "vendor", limit: 500 });
  });

  it("bounds retries when the registry continually changes", async () => {
    const call = vi.fn(async (_plugin: string, method: string) => ({ result: method === "list_providers"
      ? { providers: [provider], revision: 1 } : { models: [], more: false, revision: 2 } }));
    await expect(listCatalog(clientWith(call))).rejects.toThrow("changed while reading");
    expect(call).toHaveBeenCalledTimes(6);
  });

  it.each([
    { models: [], more: true, revision: 1 },
    { models: [{ ...model("x"), provider_id: "other" }], more: true, revision: 1 },
    { models: [model("x"), model("x")], more: false, revision: 1 },
    { models: [model("z"), model("a")], more: false, revision: 1 },
  ])("rejects stalled or invalid paging without exposing partial results: %j", async (result) => {
    await expect(listProviderModels(clientWith(vi.fn().mockResolvedValue({ result })), "vendor"))
      .rejects.toThrow(/pagination/);
  });

  it("rejects a repeated page cursor", async () => {
    const call = vi.fn().mockResolvedValue({ result: { models: [model("x")], more: true, revision: 1 } });
    await expect(listProviderModels(clientWith(call), "vendor")).rejects.toThrow("invalid pagination cursor");
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("reports the safety bound instead of returning an incomplete catalog", async () => {
    let page = 0;
    const call = vi.fn(async () => ({ result: { models: [model(String(page++).padStart(3, "0"))], more: true, revision: 1 } }));
    await expect(listProviderModels(clientWith(call), "vendor")).rejects.toThrow("read limit");
    expect(call).toHaveBeenCalledTimes(40);
  });

  it("propagates read errors without retrying unrelated failures", async () => {
    const call = vi.fn().mockRejectedValue(new Error("permission denied"));
    await expect(listCatalog(clientWith(call))).rejects.toThrow("permission denied");
    expect(call).toHaveBeenCalledTimes(1);
  });
});
