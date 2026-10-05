<script lang="ts">
  import { JsonUIProvider, Renderer } from "@json-render/svelte";
  import type { Spec } from "@json-render/core";
  import { chatRegistry } from "../json-render/catalog/chat-registry";
  import { provideSpec } from "./spec-context";
  import { pluginFeedReader } from "./plugin-feeds";
  import FeedBoundCanvas from "./FeedBoundCanvas.svelte";
  import "../json-render/catalog/dashboard-components.css";
  let { spec }: { spec: Spec } = $props();
  provideSpec(() => spec, chatRegistry);
  const readFeeds = pluginFeedReader();
</script>

{#key spec}
  <svelte:boundary>
    {#if readFeeds}
      <FeedBoundCanvas {spec} {readFeeds} />
    {:else}
      <JsonUIProvider initialState={spec.state ?? {}}
        ><Renderer {spec} registry={chatRegistry} /></JsonUIProvider
      >
    {/if}
    {#snippet failed(error)}<p role="alert">
        This result could not render: {error instanceof Error
          ? error.message
          : "Invalid canvas."}
      </p>{/snippet}
  </svelte:boundary>
{/key}
