<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { ChatCatalog } from "../../json-render/catalog/chat-catalog";
  let {
    props,
    children,
  }: BaseComponentProps<
    InferComponentProps<ChatCatalog, "dashboardDisclosure">
  > = $props();
</script>

<details class="db-ref db-ref-disclosure" open={props.initiallyOpen}>
  <summary>{props.title}</summary>{#if props.summary}<p>
      {props.summary}
    </p>{/if}{@render children?.()}
</details>
