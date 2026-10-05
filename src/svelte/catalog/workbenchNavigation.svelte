<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { ChatCatalog } from "../../json-render/catalog/chat-catalog";
  let {
    ..._props
  }: BaseComponentProps<
    InferComponentProps<ChatCatalog, "workbenchNavigation">
  > = $props();
  import Navigation from "../WorkbenchNavigation.svelte";
</script>

<Navigation />
