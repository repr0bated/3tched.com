<script lang="ts">
  import type { Spec } from "@json-render/core";
  import { createLocalChatAdapter } from "../../chat/local-chat-adapter";
  import { Runtime, provideRuntime } from "../../svelte/runtime.svelte";
  import { ChatSession } from "../../svelte/chat-session";
  import { provideSession } from "../../svelte/session-context";
  import Chat from "../../svelte/Chat.svelte";
  import SpecRenderer from "../../svelte/SpecRenderer.svelte";
  import { CHAT_MODES } from "../../chat/chat-mode";

  export const ssr = false;

  const adapter = createLocalChatAdapter(300);

  let currentMode = $state("personal");
  let canvasSpec = $state<Spec | null>(null);

  const runtime = new Runtime(adapter);
  const session = new ChatSession();
  provideRuntime(runtime);
  provideSession(session);
  session.configure(runtime.snapshot());

  $effect(() => {
    const s = session;
    if (!s || s.current.messages.length === 0) {
      canvasSpec = null;
      return;
    }
    const last = s.current.messages[s.current.messages.length - 1];
    if (last.role === "agent" && last.canvasSpec) {
      canvasSpec = last.canvasSpec;
    } else {
      canvasSpec = null;
    }
    return s.subscribe(() => {});
  });

  function setMode(mode: string) {
    currentMode = mode;
    canvasSpec = null;
    runtime.setChatContext({
      mode: mode as "personal" | "project" | "control_plane" | "accountability" | "notebook_lm" | "ui_render",
      session_id: "local",
      project_id: null,
      memory_namespace: "session/local/personal/main",
      read_only: false,
      effective_capabilities: ["chat.context"],
      allowed_agents: [],
      selected_agent: null,
    });
    session.clear();
  }
</script>

<div class="demo-chat-layout">
  <header class="demo-header">
    <h1>3tched Chat</h1>
    <p class="demo-subtitle">Local preview · simulated responses</p>
    <div class="mode-selector">
      <label>Mode:</label>
      <select bind:value={currentMode} onchange={() => setMode(currentMode)}>
        {#each CHAT_MODES as m}
          <option value={m.id}>{m.label}</option>
        {/each}
      </select>
    </div>
  </header>

  <div class="demo-content">
    <div class="demo-chat-pane">
      <Chat session={session} runtime={runtime} />
    </div>
    <div class="demo-canvas-pane">
      {#if canvasSpec}<SpecRenderer spec={canvasSpec} />{/if}
    </div>
  </div>
</div>

<style>
  .demo-chat-layout {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--bg, #1a1a2e);
    color: var(--fg, #e0e0e0);
  }

  .demo-header {
    padding: 16px 24px;
    border-bottom: 1px solid #333;
    display: flex;
    align-items: center;
    gap: 24px;
  }

  .demo-header h1 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
  }

  .demo-subtitle {
    margin: 0;
    font-size: 0.85rem;
    color: #888;
  }

  .mode-selector {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .mode-selector select {
    padding: 4px 8px;
    background: #222;
    color: #e0e0e0;
    border: 1px solid #444;
    border-radius: 4px;
    cursor: pointer;
  }

  .demo-content {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .demo-chat-pane {
    flex: 1;
    overflow-y: auto;
    border-right: 1px solid #333;
  }

  .demo-canvas-pane {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    background: #0f0f23;
  }
</style>
