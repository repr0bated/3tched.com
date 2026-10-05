<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { ChatCatalog } from "../../json-render/catalog/chat-catalog";
  let {
    props,
  }: BaseComponentProps<
    InferComponentProps<ChatCatalog, "dashboardFormPreview">
  > = $props();
  const id = $props.id();
</script>

<fieldset class="db-ref db-ref-form" disabled aria-label={props.title}>
  <legend
    >{props.title}
    <span class="db-ref__muted">· static reference, unavailable</span></legend
  >{#each props.fields as field (field.id)}<div class="db-ref-form__field">
      <label for={`${id}-${field.id}`}>{field.label}</label
      >{#if field.type === "textarea"}<textarea
          id={`${id}-${field.id}`}
          value={field.value ?? ""}
        ></textarea>{:else if field.type === "select"}<select
          id={`${id}-${field.id}`}
          value={field.value ?? field.options?.[0] ?? ""}
          >{#each field.options ?? [] as option, index (index)}<option
              value={option}>{option}</option
            >{/each}</select
        >{:else if field.type === "toggle"}<input
          id={`${id}-${field.id}`}
          type="checkbox"
          checked={field.checked ?? false}
        />{:else}<input
          id={`${id}-${field.id}`}
          type={field.type}
          value={field.value ?? ""}
        />{/if}{#if field.help}<small>{field.help}</small>{/if}
    </div>{/each}
</fieldset>
