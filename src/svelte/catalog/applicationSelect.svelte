<script lang="ts">
  import { getBoundProp, type BaseComponentProps } from "@json-render/svelte";
  let { props, emit, bindings }: BaseComponentProps<{ label: string; value: string; options: Record<string, unknown>[]; valueField: string; labelField: string }> = $props();
  const value = getBoundProp<string>(() => props.value, () => bindings?.value);
  const options = $derived(props.options.map(option => {
    const id = Object.hasOwn(option, props.valueField) ? option[props.valueField] : undefined;
    const label = Object.hasOwn(option, props.labelField) ? option[props.labelField] : undefined;
    if (typeof id !== "string" || typeof label !== "string") throw new Error("Selection options do not match their declared fields.");
    return { id, label };
  }));
</script>
<label>{props.label}<select value={value.current} onchange={(event) => { value.current = event.currentTarget.value; emit("change"); }}>
  <option value="" disabled>Select {props.label}</option>
  {#each options as option}<option value={option.id}>{option.label}</option>{/each}
</select></label>
<style>
  label { display: grid; gap: .25rem; }
  select { color: inherit; background: var(--background, #171717); border: 1px solid currentColor; padding: .5rem; }
  select:focus-visible { outline: 3px solid currentColor; outline-offset: 2px; }
</style>
