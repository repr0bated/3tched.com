<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { ChatCatalog } from "../../json-render/catalog/chat-catalog";
  let {
    ..._props
  }: BaseComponentProps<InferComponentProps<ChatCatalog, "chatModeSelector">> =
    $props();
  import ModeStrip from "../ModeStrip.svelte";
  import KnowledgeStrip from "../KnowledgeStrip.svelte";
  import { getRuntime } from "../runtime.svelte";
  const runtime = getRuntime();
</script>

<ModeStrip adapter={runtime.adapter} onContextChange={runtime.setChatContext} />
<KnowledgeStrip adapter={runtime.adapter} />
