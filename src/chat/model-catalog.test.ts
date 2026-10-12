import { describe, expect, it, vi } from "vitest";
import { DoorError, type DoorClient } from "../grpc/door";
import { listCatalog, listProviderModels, refreshCatalog } from "./model-catalog";

const provider = { provider_id: "vendor", configured: true, enabled: true, status: "ok", control_plane_profiles: ["custom.control_plane"] };
const model = (id: string) => ({ provider_id: "vendor", model_id: id, available: true });
function clientWith(call: ReturnType<typeof vi.fn>) {
  return { call } as unknown as DoorClient;
}

const refreshed = {
  refreshed_at: "2026-10-11T14:36:00Z", revision: 1,
  providers: [{ provider_id: "vendor", status: "ok", available_models: 0, added: 0, dropped: 0 }],
};

describe("catalog refresh", () => {
  it("refreshes once with bounded admission before reading the committed catalog", async () => {
    const call = vi.fn()
      .mockResolvedValueOnce({ result: refreshed })
      .mockResolvedValueOnce({ result: { providers: [provider], revision: 1 } })
      .mockResolvedValueOnce({ result: { models: [model("fresh")], more: false, revision: 1 } });
    expect(await refreshCatalog(clientWith(call))).toEqual({
      providers: [provider], models: [model("fresh")], refreshError: null,
    });
    expect(call.mock.calls).toEqual([
      ["model_registry", "refresh", {}, "model_registry.refresh", { timeoutMs: 300_000 }],
      ["model_registry", "list_providers", {}, "model_registry.read"],
      ["model_registry", "list_models", { provider_id: "vendor", limit: 500 }, "model_registry.read"],
    ]);
  });

  it("keeps refreshed and stored models when one provider refresh fails", async () => {
    const storedProvider = { ...provider, provider_id: "stored" };
    const storedModel = { ...model("previous"), provider_id: "stored" };
    const call = vi.fn()
      .mockResolvedValueOnce({ result: { ...refreshed, providers: [
        { provider_id: "vendor", status: "ok", available_models: 0, added: 0, dropped: 0 },
        { provider_id: "stored", status: "error", available_models: 0, added: 0, dropped: 0, error: "private backend detail" },
      ] } })
      .mockResolvedValueOnce({ result: { providers: [provider, storedProvider], revision: 1 } })
      .mockResolvedValueOnce({ result: { models: [model("fresh")], more: false, revision: 1 } })
      .mockResolvedValueOnce({ result: { models: [storedModel], more: false, revision: 1 } });
    const result = await refreshCatalog(clientWith(call));
    expect(result.models).toEqual([model("fresh"), storedModel]);
    expect(result.refreshError).toBe("Could not refresh stored. Showing stored models for those providers.");
    expect(result.refreshError).not.toContain("private backend detail");
    expect(call.mock.calls.filter(args => args[1] === "refresh")).toHaveLength(1);
  });

  it.each([
    new DoorError("PERMISSION_DENIED", "Refresh capability not held."),
    new DoorError("INTERNAL", "Operation failed.",
      "method_outcome_unknown; operation_id=8e0adbef-441f-493f-a61d-a028e6dfca48; do not retry automatically"),
  ])("reads stored choices after a refused or uncertain refresh without replay", async error => {
    const call = vi.fn().mockRejectedValueOnce(error)
      .mockResolvedValueOnce({ result: { providers: [provider], revision: 1 } })
      .mockResolvedValueOnce({ result: { models: [model("stored")], more: false, revision: 1 } });
    const result = await refreshCatalog(clientWith(call));
    expect(result.models).toEqual([model("stored")]);
    expect(result.refreshError).toContain(error.statusDetail ?? error.message);
    expect(result.refreshError).toContain("freshness is unconfirmed");
    expect(call.mock.calls.map(args => args[1])).toEqual(["refresh", "list_providers", "list_models"]);
  });

  it.each(["UNAUTHENTICATED", "CANCELLED"])("stops before reads after refresh %s", async code => {
    const error = new DoorError(code, "Refresh refused.");
    const call = vi.fn().mockRejectedValue(error);
    await expect(refreshCatalog(clientWith(call))).rejects.toBe(error);
    expect(call).toHaveBeenCalledTimes(1);
    expect(call.mock.calls[0][1]).toBe("refresh");
  });

  it("does not replay refresh when consistent catalog reads must retry", async () => {
    const call = vi.fn(async (_plugin: string, method: string) => ({ result: method === "refresh"
      ? refreshed : method === "list_providers"
        ? { providers: [provider], revision: 1 } : { models: [], more: false, revision: 2 } }));
    await expect(refreshCatalog(clientWith(call))).rejects.toThrow("changed while reading");
    expect(call.mock.calls.map(args => args[1])).toEqual([
      "refresh", "list_providers", "list_models", "list_providers", "list_models", "list_providers", "list_models",
    ]);
  });

  it("stops page continuation when the identity changes during a model read", async () => {
    let current = true;
    const call = vi.fn(async (_plugin: string, method: string) => {
      if (method === "refresh") return { result: refreshed };
      if (method === "list_providers") return { result: { providers: [provider], revision: 1 } };
      current = false;
      return { result: { models: [model("first")], more: true, revision: 1 } };
    });
    const assertCurrent = () => { if (!current) throw new DoorError("CANCELLED", "Identity changed."); };
    await expect(refreshCatalog(clientWith(call), assertCurrent)).rejects.toMatchObject({ code: "CANCELLED" });
    expect(call.mock.calls.map(args => args[1])).toEqual(["refresh", "list_providers", "list_models"]);
  });
});

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
