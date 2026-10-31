import { describe, expect, it, vi } from "vitest";
import type { DoorClient } from "../grpc/door";
import type { CatalogModel } from "./model-catalog";
import {
  CONTROL_PLANE_PROVIDER_PATH,
  ControlPlaneMutationUnconfirmedError,
  authorizeTask,
  currentControlPlaneModel,
  setControlPlaneModel,
} from "./control-plane-model";

const selection = { providerId: "catalog_provider", modelId: "new-model/from-provider" };
const models: CatalogModel[] = [{
  provider_id: selection.providerId, model_id: selection.modelId, available: true,
  control_plane_profile: "custom.dynamic_route",
  inference_url_prefix: "https://inference.example/subscription",
}];
const nativePath = "providers.models.custom.dynamic_route.model";
const nativeUriPath = "providers.models.custom.dynamic_route.uri";
const nativeUri = "https://inference.example/subscription/v1";

function fake(values: Record<string, string | null> = {}, canApply = false) {
  const calls: Array<{ plugin: string; method: string; args: Record<string, unknown>; capability: string }> = [];
  const call = vi.fn(async (plugin: string, method: string, args: Record<string, unknown>, capability: string) => {
    calls.push({ plugin, method, args, capability });
    const result: Record<string, unknown> = method === "config_get" ? { value: values[args.path as string] }
      : method === "get_own_agent_route_access" ? { can_apply: canApply }
      : method === "apply_own_agent_route" ? { mode: "control_plane", reference: models[0].control_plane_profile, model: selection.modelId, uri: nativeUri }
      : {};
    return { result };
  });
  const client = { call } as unknown as DoorClient;
  return { client, calls, call };
}

function beforeChange() {
  return fake({ [CONTROL_PLANE_PROVIDER_PATH]: "openai.previous_route", [nativePath]: "previous-model", [nativeUriPath]: nativeUri });
}

describe("Control Plane uses the shared catalog model", () => {
  it("reads the actual model and resolves its exact provider key", async () => {
    const { client, calls } = fake({ [CONTROL_PLANE_PROVIDER_PATH]: "custom.dynamic_route", [nativePath]: selection.modelId, [nativeUriPath]: nativeUri });
    expect(await currentControlPlaneModel(client, models)).toEqual(selection);
    expect(calls.map((call) => call.args.path)).toEqual([CONTROL_PLANE_PROVIDER_PATH, nativePath, nativeUriPath, nativePath, nativeUriPath, CONTROL_PLANE_PROVIDER_PATH]);
    expect(calls.every((call) => call.capability === "cap.software.tched-router.router.read@v1")).toBe(true);
  });

  it("keeps an unmapped native selection visible without guessing a catalog provider", async () => {
    const { client } = fake({ [CONTROL_PLANE_PROVIDER_PATH]: "custom.dynamic_route", [nativePath]: "unknown-model", [nativeUriPath]: nativeUri });
    expect(await currentControlPlaneModel(client, models)).toEqual({ providerId: "custom.dynamic_route", modelId: "unknown-model" });
  });

  it("rejects a changing current reference rather than confirming a mixed read", async () => {
    const { client, call } = fake();
    call.mockResolvedValueOnce({ result: { value: "custom.dynamic_route" } });
    call.mockResolvedValueOnce({ result: { value: selection.modelId } });
    call.mockResolvedValueOnce({ result: { value: nativeUri } });
    call.mockResolvedValueOnce({ result: { value: selection.modelId } });
    call.mockResolvedValueOnce({ result: { value: nativeUri } });
    call.mockResolvedValueOnce({ result: { value: "openai.changed_route" } });
    await expect(currentControlPlaneModel(client, models)).rejects.toThrow("changed while reading");
  });

  it("elevates and atomically patches both model and agent with exactly the same guarded arguments", async () => {
    const { client, calls } = beforeChange();
    const elevate = vi.fn(async (plugin, method, args) => {
      expect(calls.every((call) => ["get_own_agent_route_access", "config_get"].includes(call.method))).toBe(true);
      expect(plugin).toBe("chat_router");
      expect(method).toBe("config_patch");
      expect(args.operations).toEqual([
        { op: "test", path: "/agents/control_plane/model_provider", value: "openai.previous_route" },
        { op: "test", path: "/providers/models/custom/dynamic_route/model", value: "previous-model" },
        { op: "test", path: "/providers/models/custom/dynamic_route/uri", value: nativeUri },
        { op: "replace", path: "/providers/models/custom/dynamic_route/model", value: selection.modelId },
        { op: "replace", path: "/agents/control_plane/model_provider", value: "custom.dynamic_route" },
      ]);
    });
    await setControlPlaneModel(client, selection, models, elevate);
    expect(elevate).toHaveBeenCalledOnce();
    const patch = calls.find((call) => call.method === "config_patch")!;
    expect(patch.args).toEqual(elevate.mock.calls[0][2]);
    expect(patch.capability).toBe("cap.software.tched-router.router.write@v1");
    expect(calls.some((call) => call.method === "SetSelection" || call.method === "config_set")).toBe(false);
  });

  it("uses the selected record's routing binding, including a newly discovered model", async () => {
    const { client, calls } = fake({
      [CONTROL_PLANE_PROVIDER_PATH]: "custom.dynamic_route",
      "providers.models.anthropic.messages_route.model": "old",
      "providers.models.anthropic.messages_route.uri": nativeUri,
    });
    const record = { ...models[0], control_plane_profile: "anthropic.messages_route" };
    await setControlPlaneModel(client, selection, [record], async () => {});
    expect(calls.at(-1)?.args.operations).toContainEqual({ op: "replace", path: "/providers/models/anthropic/messages_route/model", value: selection.modelId });
  });

  it("reports a missing binding without hiding or inventing the catalog model", async () => {
    const { client, calls } = beforeChange();
    const elevate = vi.fn();
    await expect(setControlPlaneModel(client, selection, [{ ...models[0], control_plane_profile: null }], elevate)).rejects.toThrow("no native routing binding");
    expect(calls).toEqual([]);
    expect(elevate).not.toHaveBeenCalled();
  });

  it("rejects missing records and unsafe binding paths before any native call", async () => {
    const { client, calls } = beforeChange();
    await expect(setControlPlaneModel(client, selection, [], vi.fn())).rejects.toThrow("no longer in the catalog");
    await expect(setControlPlaneModel(client, selection, [{ ...models[0], control_plane_profile: "../other" }], vi.fn())).rejects.toThrow("invalid native routing binding");
    expect(calls).toEqual([]);
  });

  it("does not mutate when elevation is refused", async () => {
    const { client, calls } = beforeChange();
    await expect(setControlPlaneModel(client, selection, models, async () => { throw new Error("cancelled"); })).rejects.toThrow("cancelled");
    expect(calls.every((call) => ["get_own_agent_route_access", "config_get"].includes(call.method))).toBe(true);
  });

  it("requires reconciliation if the mutation response is lost", async () => {
    const { client, call } = beforeChange();
    call.mockResolvedValueOnce({ result: { can_apply: false } });
    call.mockResolvedValueOnce({ result: { value: "openai.previous_route" } });
    call.mockResolvedValueOnce({ result: { value: "previous-model" } });
    call.mockResolvedValueOnce({ result: { value: nativeUri } });
    call.mockRejectedValueOnce(new Error("connection lost"));
    await expect(setControlPlaneModel(client, selection, models, async () => {})).rejects.toBeInstanceOf(ControlPlaneMutationUnconfirmedError);
  });

  it("does not request another ticket for an already selected exact pair", async () => {
    const { client, calls } = fake({ [CONTROL_PLANE_PROVIDER_PATH]: "custom.dynamic_route", [nativePath]: selection.modelId, [nativeUriPath]: nativeUri });
    const elevate = vi.fn();
    await setControlPlaneModel(client, selection, models, elevate);
    expect(elevate).not.toHaveBeenCalled();
    expect(calls.every((call) => ["get_own_agent_route_access", "config_get"].includes(call.method))).toBe(true);
  });

  it("uses server-authorized own selection without elevation or client target paths", async () => {
    const { client, calls } = fake({}, true);
    const elevate = vi.fn();
    await setControlPlaneModel(client, selection, models, elevate);
    expect(elevate).not.toHaveBeenCalled();
    expect(calls.at(-1)).toEqual({
      plugin: "chat_router", method: "apply_own_agent_route",
      args: { provider_id: selection.providerId, model_id: selection.modelId },
      capability: "cap.software.tched-router.agent.route.self.write@v1",
    });
    expect(calls.some(call => ["config_get", "config_patch", "authorize_task"].includes(call.method))).toBe(false);
  });

  it("never falls back to administration after a scoped denial or mismatched readback", async () => {
    for (const response of [new Error("permission denied"), { mode: "accountability", reference: models[0].control_plane_profile, model: selection.modelId, uri: nativeUri }]) {
      const { client, calls, call } = fake({}, true);
      call.mockResolvedValueOnce({ result: { can_apply: true } });
      if (response instanceof Error) call.mockRejectedValueOnce(response);
      else call.mockResolvedValueOnce({ result: response });
      const elevate = vi.fn();
      await expect(setControlPlaneModel(client, selection, models, elevate)).rejects.toBeInstanceOf(ControlPlaneMutationUnconfirmedError);
      expect(elevate).not.toHaveBeenCalled();
      expect(calls.some(call => call.method === "config_patch")).toBe(false);
    }
  });

  it("fails closed on unavailable authoritative access instead of guessing from mode", async () => {
    const { client, call } = fake();
    call.mockRejectedValueOnce(new Error("access unavailable"));
    const elevate = vi.fn();
    await expect(setControlPlaneModel(client, selection, models, elevate)).rejects.toThrow("access unavailable");
    expect(elevate).not.toHaveBeenCalled();
  });
});

it("authorizes an exact task through the elevation plugin", async () => {
  const { client, calls } = fake();
  await authorizeTask(client, "json_render", "retire_catalog_entry", { entry_id: "e", reason: "" }, "fixture-password");
  expect(calls[0]).toEqual({
    plugin: "elevation", method: "authorize_task",
    args: { plugin: "json_render", method: "retire_catalog_entry", args: { entry_id: "e", reason: "" }, password: "fixture-password" },
    capability: "elevation.authorize",
  });
});
