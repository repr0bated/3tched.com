<script lang="ts">
  import { defineRegistry, JsonUIProvider, Renderer, type ComponentRegistry } from "@json-render/svelte";
  import { createStateStore } from "@json-render/core";
  import { z } from "zod";
  import { applicationCatalog, applicationProfile } from "../json-render/references/application-contract";
  import { validateApplicationSpec, statePointer, type ApplicationSpec } from "../json-render/references/application-validation";
  import { chatRegistry } from "../json-render/catalog/chat-registry";
  import applicationOverlay from "./catalog/applicationOverlay.svelte";
  import applicationInput from "./catalog/applicationInput.svelte";
  import applicationButton from "./catalog/applicationButton.svelte";
  import applicationSelect from "./catalog/applicationSelect.svelte";
  import { getSession } from "./session-context";
  import { provideSpec } from "./spec-context";
  import { applicationRendererPin } from "../chat/mounted-catalog";
  import { pluginFeedReader } from "./plugin-feeds";
  let { spec }: { spec: ApplicationSpec } = $props();
  const admitted = validateApplicationSpec(spec);
  const rendererHash = applicationRendererPin(admitted);
  if (!rendererHash) throw new Error("Current caller-mounted application admission is required.");
  const readFeeds = pluginFeedReader();
  let stale = $state(false);
  $effect(() => {
    const feeds = readFeeds?.().plugins;
    if (!feeds) return;
    for (const [plugin, hash] of Object.entries({ ...admitted.target_contracts, json_render: rendererHash })) {
      const feed = feeds[plugin];
      if (feed && (feed.removed || (feed.schemaHash && feed.schemaHash !== hash))) stale = true;
    }
  });
  const store = createStateStore({ ...(admitted.state ?? {}) });
  const invoke = getSession()?.applicationInvoker();
  let error = $state<string | null>(null);
  let pending = false;
  let disposed = false;
  $effect(() => () => { disposed = true; });
  const applicationComponents = defineRegistry(applicationCatalog, {
    components: { applicationOverlay, applicationInput, applicationButton, applicationSelect },
  }).registry;
  const available: ComponentRegistry = { ...chatRegistry, ...applicationComponents };
  const registry: ComponentRegistry = Object.fromEntries(applicationProfile.components.map(({ name }) => {
    const component = available[name];
    if (!component) throw new Error(`Application registry lacks ${name}.`);
    return [name, component];
  }));
  const actionSchema = z.fromJSONSchema(applicationProfile.actions.find(action => action.name === "invokePlugin")!.params_schema);
  const handlers = {
    setState: async (params: Record<string, unknown>) => {
      if (stale || disposed) throw new Error("Application is stale; regenerate it.");
      const parsed = z.object({ statePath: z.string(), value: z.unknown() }).strict().parse(params);
      statePointer(parsed.statePath);
      store.update({ [parsed.statePath]: parsed.value });
    },
    invokePlugin: async (params: Record<string, unknown>) => {
      if (pending || disposed || stale) throw new Error("Application action unavailable; regenerate stale applications.");
      const parsed = actionSchema.parse(params) as { plugin: string; method: string; capability: string; arguments: Record<string, unknown>; resultStatePath?: string };
      const hash = admitted.target_contracts?.[parsed.plugin];
      if (!hash || !invoke) throw new Error("Application target pin or authenticated session is unavailable.");
      if (parsed.resultStatePath) statePointer(parsed.resultStatePath);
      pending = true;
      error = null;
      try {
        const result = await invoke(parsed.plugin, parsed.method, parsed.capability, parsed.arguments, hash);
        if (stale) throw new Error("Application changed while the action was running; result withheld. Do not retry automatically.");
        if (!disposed && parsed.resultStatePath) store.update({ [parsed.resultStatePath]: result });
      } catch (cause) {
        if (!disposed) error = cause instanceof Error ? cause.message : "Application action failed; do not retry automatically.";
        throw cause;
      } finally { pending = false; }
    },
  };
  provideSpec(() => admitted, registry);
</script>
{#if error}<p role="alert">{error}</p>{/if}
{#if stale}
  <p role="alert">This application no longer matches the current sealed catalog. Regenerate it before continuing.</p>
{:else}
  <JsonUIProvider {store} {handlers}>
    <Renderer spec={admitted} {registry} />
  </JsonUIProvider>
{/if}
