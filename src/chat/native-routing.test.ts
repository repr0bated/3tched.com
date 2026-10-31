import { describe, expect, it, vi } from "vitest";
import type { DoorClient } from "../grpc/door";
import { readDedicatedRoute } from "./native-routing";
import { currentControlPlaneModel } from "./control-plane-model";
import type { CatalogModel } from "./model-catalog";

const route = { mode: "control_plane", reference: "custom.agent", model: "model-one", uri: "https://inference.example/v1/chat" };
function bound(value = route) {
  const call = vi.fn().mockResolvedValue({ result: value });
  return { call, isBoundOracle: true } as unknown as DoorClient;
}
describe("assigned caller's dedicated native route", () => {
  it("reads only the caller-bound empty-input route, without generic config access", async () => {
    const client = bound();
    await expect(readDedicatedRoute(client, "control_plane")).resolves.toEqual({ reference: route.reference, modelId: route.model, uri: route.uri });
    expect(client.call).toHaveBeenCalledExactlyOnceWith("chat_router", "get_own_agent_route", {}, "cap.software.tched-router.agent.route.self.read@v1");
  });
  it("uses server-authorized scoped reading even for a non-Oracle credential", async () => {
    const client = { call: vi.fn().mockResolvedValue({ result: route }), isBoundOracle: false } as unknown as DoorClient;
    await expect(readDedicatedRoute(client, "control_plane", true)).resolves.toEqual({ reference: route.reference, modelId: route.model, uri: route.uri });
    expect(client.call).toHaveBeenCalledExactlyOnceWith("chat_router", "get_own_agent_route", {}, "cap.software.tched-router.agent.route.self.read@v1");
  });
  it.each([
    { ...route, mode: "accountability" },
    { ...route, reference: "invalid" },
    { ...route, model: "" },
    { ...route, uri: "https://user:password@inference.example/v1/chat" },
    { ...route, uri: "http://inference.example/v1/chat" },
  ])("rejects a changed mode or malformed native route", async (value) => {
    await expect(readDedicatedRoute(bound(value), "control_plane")).rejects.toThrow();
  });
  it("displays the observed route even when the catalog cannot map it", async () => {
    const model = { provider_id: "catalog", model_id: route.model, available: true, control_plane_profile: route.reference, inference_url_prefix: "https://inference.example/v1" } as CatalogModel;
    await expect(currentControlPlaneModel(bound(), [model])).resolves.toEqual({ providerId: "catalog", modelId: route.model });
    for (const changed of [
      { ...model, control_plane_profile: "custom.other" },
      { ...model, model_id: "another" },
      { ...model, available: false },
      { ...model, inference_url_prefix: "https://other.example/v1" },
    ]) await expect(currentControlPlaneModel(bound(), [changed])).resolves.toEqual({ providerId: route.reference, modelId: route.model });
  });
});
