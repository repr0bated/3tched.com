import { z } from "zod";
import type { DoorClient } from "../grpc/door";
import { applicationProfile } from "../json-render/references/application-contract";
import { resolveApplicationValue, validateApplicationSpec } from "../json-render/references/application-validation";

const operation = z.strictObject({
  method: z.string().min(1), call_path: z.string().min(1), metadata_path: z.string().min(1),
  currently_granted: z.boolean(),
});
const plugin = z.strictObject({
  plugin_id: z.string().min(1), object_hash: z.string().min(1), schema_hash: z.string().min(1),
  schema: z.record(z.string(), z.unknown()), operations: z.array(operation), state: z.literal("not_requested"),
});
const catalog = z.strictObject({ views: z.array(z.strictObject({
  view_id: z.string().min(1), source_catalog_hash: z.string().min(1),
  source_catalog_generation: z.number().int().nonnegative(), plugins: z.array(plugin),
})).length(2) });
export type MountedCatalog = z.infer<typeof catalog>;
const applicationPins = new WeakMap<object, string>();
export function applicationRendererPin(spec: object): string | undefined {
  return applicationPins.get(spec);
}

export async function readMountedCatalog(client: DoorClient, pluginId?: string): Promise<MountedCatalog> {
  const { result } = await client.call<unknown>("tched_fs", "get_catalog", { plugin: pluginId ?? null },
    "cap.storage.3tchedfs.contract.read@v1");
  const parsed = catalog.parse(result);
  const seen = new Set<string>();
  for (const view of parsed.views) for (const entry of view.plugins) {
    if (seen.has(entry.plugin_id) || (pluginId !== undefined && entry.plugin_id !== pluginId))
      throw new Error("Mounted catalog has ambiguous plugin ownership.");
    seen.add(entry.plugin_id);
  }
  return parsed;
}

function sameJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right))
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => sameJson(value, right[index]));
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
  return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => Object.hasOwn(b, key) && sameJson(a[key], b[key]));
}

/** Admit a generated or retained application against current caller-visible seals. */
export async function admitMountedApplication(client: DoorClient, value: unknown, rendererHash: string) {
  const current = await readMountedCatalog(client);
  const plugins = new Map(current.views.flatMap(view => view.plugins).map(entry => [entry.plugin_id, entry]));
  const renderer = plugins.get("json_render");
  const fields = z.record(z.string(), z.unknown()).parse(renderer?.schema.fields);
  const profile = z.object({ default: z.unknown() }).parse(fields.application_profile).default;
  if (!rendererHash || renderer?.schema_hash !== rendererHash || !sameJson(profile, applicationProfile))
    throw new Error("Application renderer is stale or differs from this UI bundle. Regenerate with the current renderer.");
  const spec = validateApplicationSpec(value);
  for (const [name, hash] of Object.entries(spec.target_contracts ?? {})) {
    if (plugins.get(name)?.schema_hash !== hash) throw new Error("Application target seal is stale. Regenerate the application.");
  }
  for (const element of Object.values(spec.elements)) for (const binding of Object.values(element.on ?? {})) {
    const action = z.object({ action: z.string(), params: z.unknown() }).parse(binding);
    if (action.action !== "invokePlugin") continue;
    const params = z.object({ plugin: z.string(), method: z.string(), capability: z.string(), arguments: z.record(z.string(), z.unknown()) })
      .parse(resolveApplicationValue(action.params, spec.state ?? {}));
    const target = plugins.get(params.plugin);
    const methods = z.record(z.string(), z.unknown()).parse(target?.schema.methods);
    const declaration = z.object({ required_capability: z.string(), args: z.record(z.string(), z.unknown()) }).parse(methods[params.method]);
    if (declaration.required_capability !== params.capability || !target?.operations.some(entry => entry.method === params.method && entry.currently_granted))
      throw new Error("Application action is no longer authorized. Regenerate the application.");
    z.fromJSONSchema(declaration.args).parse(params.arguments);
  }
  applicationPins.set(spec, rendererHash);
  return spec;
}
