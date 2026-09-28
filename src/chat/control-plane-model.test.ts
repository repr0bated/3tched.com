import { describe, expect, it } from "vitest";
import type { DoorClient } from "../grpc/door";
import {
  CONTROL_PLANE_PROVIDER_PATH,
  authorizeTask,
  currentControlPlaneModel,
  listControlPlaneModels,
  setControlPlaneModel,
} from "./control-plane-model";

function fake(results: Record<string, unknown>) {
  const calls: Array<{ method: string; args: Record<string, unknown>; capability: string }> = [];
  const client = {
    async call(_plugin: string, method: string, args: Record<string, unknown>, capability: string) {
      calls.push({ method, args, capability });
      return { result: results[method] ?? {} };
    },
  } as unknown as DoorClient;
  return { client, calls };
}

describe("control plane model", () => {
  it("offers only the OpenCode Go control plane profiles", async () => {
    const { client, calls } = fake({
      config_list: {
        entries: [
          { path: "providers.models.opencode.go_control_plane.model", value: "glm-5.3-flash" },
          { path: "providers.models.opencode.go_cp_route_grok_47.model", value: "grok-4.7" },
          { path: "providers.models.anthropic.go_cp_route_qwen38_flash.model", value: "qwen3.8-flash" },
          { path: "providers.models.opencode.go_dashboard.model", value: "glm-5.3-flash" },
          { path: "providers.models.opencode.go_cp_route_grok_47.api_key", value: "****" },
        ],
      },
    });
    const options = await listControlPlaneModels(client);
    expect(options.map((option) => option.reference)).toEqual([
      "opencode.go_control_plane",
      "opencode.go_cp_route_grok_47",
      "anthropic.go_cp_route_qwen38_flash",
    ]);
    expect(calls[0]).toEqual({
      method: "config_list",
      args: { prefix: "providers.models" },
      capability: "cap.software.tched-router.router.read@v1",
    });
  });

  it("reads and sets the agent's provider through the admitted config methods", async () => {
    const { client, calls } = fake({ config_get: { value: "opencode.go_control_plane" } });
    expect(await currentControlPlaneModel(client)).toBe("opencode.go_control_plane");
    await setControlPlaneModel(client, "opencode.go_cp_route_grok_47");
    expect(calls[1]).toEqual({
      method: "config_set",
      args: { path: CONTROL_PLANE_PROVIDER_PATH, value: "opencode.go_cp_route_grok_47" },
      capability: "cap.software.tched-router.router.write@v1",
    });
    await expect(setControlPlaneModel(client, "custom.anything")).rejects.toThrow();
    expect(calls).toHaveLength(2);
  });
});

describe("control plane model elevation", () => {
  it("elevates with the exact config_set arguments before sending them", async () => {
    const { client, calls } = fake({});
    const elevated: unknown[] = [];
    await setControlPlaneModel(client, "opencode.go_cp_route_grok_47", async (plugin, method, args) => {
      elevated.push({ plugin, method, args, before: calls.length });
    });
    expect(elevated).toEqual([
      {
        plugin: "tched_router",
        method: "config_set",
        args: { path: CONTROL_PLANE_PROVIDER_PATH, value: "opencode.go_cp_route_grok_47" },
        before: 0,
      },
    ]);
    expect(calls[0].args).toEqual((elevated[0] as { args: unknown }).args);
  });

  it("does not send the change when elevation is refused", async () => {
    const { client, calls } = fake({});
    await expect(
      setControlPlaneModel(client, "opencode.go_control_plane", async () => {
        throw new Error("Sudo elevation cancelled.");
      }),
    ).rejects.toThrow("cancelled");
    expect(calls).toHaveLength(0);
  });

  it("authorizes a task through the elevation plugin", async () => {
    const { client, calls } = fake({});
    await authorizeTask(client, "json_render", "retire_catalog_entry", { entry_id: "e", reason: "" }, "pw");
    expect(calls[0]).toEqual({
      method: "authorize_task",
      args: { plugin: "json_render", method: "retire_catalog_entry", args: { entry_id: "e", reason: "" }, password: "pw" },
      capability: "elevation.authorize",
    });
  });
});
