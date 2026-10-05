<script lang="ts">
  import { JsonUIProvider, Renderer } from "@json-render/svelte";
  import { createStateStore, type Spec } from "@json-render/core";
  import { chatRegistry } from "../json-render/catalog/chat-registry";
  import { pluginStateBindings, type FeedSnapshot } from "../grpc/plugin-feeds";
  import { readonlyPluginStore } from "./plugin-feeds";
  let { spec, readFeeds }: { spec: Spec; readFeeds: () => FeedSnapshot } = $props();
  const backing = createStateStore({ ...(spec.state ?? {}) });
  const store = readonlyPluginStore(backing);
  $effect(() => {
    const current = readFeeds();
    backing.update({
      "/plugins": pluginStateBindings(current),
      "/pluginFeeds": current,
    });
  });
</script>

<JsonUIProvider {store}><Renderer {spec} registry={chatRegistry} /></JsonUIProvider>
