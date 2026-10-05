<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { ChatCatalog } from "../../json-render/catalog/chat-catalog";
  let {
    ..._props
  }: BaseComponentProps<InferComponentProps<ChatCatalog, "tchedRouterPicker">> =
    $props();
  import ModelPicker from "../ModelPicker.svelte";
  import { getRuntime } from "../runtime.svelte";
  const runtime = getRuntime();
</script>

{#key runtime.scopeKey}<ModelPicker />{/key}
