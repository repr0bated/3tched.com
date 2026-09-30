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
  it("offers every configured provider profile, not only OpenCode and custom", async () => {
    const { client, calls } = fake({
      list_providers: {
        providers: [
          { provider_id: "opencode_go", name: "OpenCode Go", configured: true, enabled: true, status: "never", control_plane_profiles: ["opencode.go_control_plane", "anthropic.go_control_plane_messages"] },
          { provider_id: "openrouter", name: "OpenRouter", configured: true, enabled: true, status: "never", control_plane_profiles: ["openrouter.control_plane"] },
          { provider_id: "cheaper_inference", name: "Cheaper Inference", configured: true, enabled: true, status: "never", control_plane_profiles: ["custom.cheaper_inference_control_plane"] },
          { provider_id: "openai", name: "OpenAI", configured: true, enabled: true, status: "never", control_plane_profiles: ["openai.control_plane"] },
          { provider_id: "retired", name: "Retired", configured: false, enabled: false, status: "removed", control_plane_profiles: ["xai.control_plane"] },
          { provider_id: "broken", name: "Broken", configured: true, enabled: true, status: "ok", control_plane_profiles: ["not a profile"] },
        ],
      },
    });
    const options = await listControlPlaneModels(client);
    expect(options).toEqual([
      { reference: "custom.cheaper_inference_control_plane", model: "Cheaper Inference" },
      { reference: "openai.control_plane", model: "OpenAI" },
      { reference: "anthropic.go_control_plane_messages", model: "OpenCode Go" },
      { reference: "opencode.go_control_plane", model: "OpenCode Go" },
      { reference: "openrouter.control_plane", model: "OpenRouter" },
    ]);
    expect(calls[0]).toEqual({
      method: "list_providers",
      args: {},
      capability: "model_registry.read",
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
    await expect(setControlPlaneModel(client, "not-a-profile")).rejects.toThrow();
    await setControlPlaneModel(client, "openrouter.control_plane");
    expect(calls[2]).toEqual({
      method: "config_set",
      args: { path: CONTROL_PLANE_PROVIDER_PATH, value: "openrouter.control_plane" },
      capability: "cap.software.tched-router.router.write@v1",
    });
    expect(calls).toHaveLength(3);
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
