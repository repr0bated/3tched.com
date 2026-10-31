<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  let { props, emit }: BaseComponentProps<{ label: string }> = $props();
</script>
<button onclick={() => emit("press")}>{props.label}</button>
<style>
  button { padding: .5rem 1rem; color: inherit; background: transparent; border: 1px solid currentColor; border-radius: .25rem; }
  button:focus-visible { outline: 3px solid currentColor; outline-offset: 3px; }
</style>
