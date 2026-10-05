<script lang="ts">
  import RuntimeHost from "../../svelte/RuntimeHost.svelte";
  import SpecRenderer from "../../svelte/SpecRenderer.svelte";
  import ModelPicker from "../../svelte/ModelPicker.svelte";
  import { createLocalChatAdapter } from "../../chat/local-chat-adapter";
  import type { ChatAdapter } from "../../chat/chat-adapter";
  import type { Spec } from "@json-render/core";
  import { antigravitySpec } from "../../json-render/pages/antigravity.pagespec";
  let {
    adapter = createLocalChatAdapter(),
    view = "spec",
    spec = antigravitySpec,
  }: {
    adapter?: ChatAdapter;
    view?: "spec" | "picker" | "runtime";
    spec?: Spec;
  } = $props();
  const personal = {
    mode: "personal" as const,
    session_id: "session",
    memory_namespace: "personal/main",
    project_id: null,
    read_only: false,
    effective_capabilities: [],
    allowed_agents: [],
    selected_agent: null,
  };
</script>

{#key adapter}<RuntimeHost {adapter}
    >{#snippet children(runtime)}
      {#if view === "picker"}
        <button onclick={() => runtime.setChatContext(personal)}
          >Personal context</button
        ><button
          onclick={() =>
            runtime.setChatContext({ ...personal, mode: "control_plane" })}
          >Control context</button
        ><button
          onclick={() =>
            runtime.setChatContext({
              ...personal,
              mode: "project",
              project_id: "project",
            })}>Project context</button
        ><span data-testid="route"
          >{runtime.route.providerId}/{runtime.route.modelId}</span
        >{#key runtime.scopeKey}<ModelPicker />{/key}
      {:else if view === "runtime"}
        <button onclick={() => void runtime.refreshProviders()}>Refresh</button
        ><span data-testid="models"
          >{runtime.providers
            .flatMap((p) => p.models.map((m) => m.id))
            .join(",")}</span
        ><span data-testid="route"
          >{runtime.route.providerId}/{runtime.route.modelId}</span
        ><span data-testid="pending">{String(runtime.catalogPending)}</span>
        <p role="status">{runtime.catalogError}</p>
      {:else}
        <button
          onclick={() =>
            runtime.setChatContext({
              ...personal,
              mode: "control_plane",
              session_id: "another-session",
              memory_namespace: "session/another-session/control_plane",
            })}>Switch verified session</button
        >
        <SpecRenderer {spec} />
      {/if}
    {/snippet}</RuntimeHost
  >{/key}
