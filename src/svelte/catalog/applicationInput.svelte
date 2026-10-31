<script lang="ts">
  import { getBoundProp, type BaseComponentProps } from "@json-render/svelte";
  let { props, emit, bindings }: BaseComponentProps<{ label: string; value: string }> = $props();
  const value = getBoundProp<string>(() => props.value, () => bindings?.value);
</script>
<label>{props.label}<input value={value.current} oninput={(event) => { value.current = event.currentTarget.value; emit("change"); }} /></label>
<style>
  label { display: grid; gap: .25rem; }
  input { color: inherit; background: transparent; border: 1px solid currentColor; padding: .5rem; }
  input:focus-visible { outline: 3px solid currentColor; outline-offset: 2px; }
</style>
