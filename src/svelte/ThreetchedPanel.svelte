<script lang="ts">
  import { onMount } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import type { DoorChatAdapter } from "../chat/door-chat-adapter";
  import type { BinaryMethod } from "../chat/threetchedfs-surface";
  import { getRuntime } from "./runtime.svelte";

  const runtime = getRuntime();
  const surface = runtime.adapter.kind === "remote"
    ? (runtime.adapter as DoorChatAdapter).binarySurface
    : null;
  let methods = $state.raw<BinaryMethod[]>([]);
  let loading = $state(false);
  let query = $state("");
  let selectedName = $state("models.list");
  let argumentsText = $state("{}");
  let confirmEffects = $state(false);
  let pending = $state(false);
  let result = $state.raw<unknown>(null);
  let error = $state("");
  let status = $state("Select a method to inspect its declaration.");
  // Sections are the dotted prefixes of the discovered method names. Turning
  // one off only hides it here; it never changes the threetched config.
  const hiddenSections = new SvelteSet<string>();
  const sectionOf = (method: BinaryMethod) => method.method.split(".")[0];
  let sections = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const method of methods) counts.set(sectionOf(method), (counts.get(sectionOf(method)) ?? 0) + 1);
    return [...counts].sort(([a], [b]) => a.localeCompare(b));
  });
  let visible = $derived(methods.filter((method) => !hiddenSections.has(sectionOf(method))));
  let selected = $derived(visible.find((method) => method.method === selectedName) ?? visible[0]);
  let filtered = $derived(visible.filter((method) =>
    method.method.toLowerCase().includes(query.trim().toLowerCase()),
  ));

  function toggleSection(name: string) {
    if (hiddenSections.has(name)) hiddenSections.delete(name); else hiddenSections.add(name);
  }
  function setAllSections(on: boolean) {
    hiddenSections.clear();
    if (!on) for (const [name] of sections) hiddenSections.add(name);
  }
  let binaryOutput = $derived(
    result && typeof result === "object" && "stdout" in result && typeof result.stdout === "string"
      ? result.stdout : "",
  );

  async function refresh() {
    if (!surface || loading) return;
    loading = true;
    error = "";
    status = "Reading this caller's mounted threetched methods…";
    try {
      methods = await surface.describe();
      if (!methods.some((method) => method.method === selectedName)) {
        selectedName = methods[0]?.method ?? "";
      }
      status = `Discovered ${methods.length} methods from this caller's mount.`;
    } catch (caught) {
      methods = [];
      error = caught instanceof Error ? caught.message : "Mounted method discovery failed.";
      status = "Mounted threetched discovery failed.";
    } finally {
      loading = false;
    }
  }

  onMount(() => { void refresh(); });

  function choose(method: BinaryMethod) {
    selectedName = method.method;
    argumentsText = "{}";
    confirmEffects = false;
    result = null;
    error = "";
    status = `${method.method} selected.`;
  }

  async function invoke() {
    if (!surface || !selected || pending) return;
    let args: unknown;
    try {
      args = JSON.parse(argumentsText);
      if (!args || typeof args !== "object" || Array.isArray(args)) {
        throw new Error("Arguments must be a JSON object.");
      }
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "Arguments must be valid JSON.";
      return;
    }
    if (selected.declaration.side_effect !== "read" && !confirmEffects) {
      error = "Confirm this binary command before calling it.";
      return;
    }
    pending = true;
    result = null;
    error = "";
    status = `Calling ${selected.method}…`;
    try {
      result = await surface.invoke(selected, args as Record<string, unknown>, confirmEffects);
      status = `${selected.method} returned a result.`;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "The method failed.";
      status = `${selected.method} did not return a result. The call was not retried.`;
    } finally {
      pending = false;
    }
  }
</script>

<section class="threetched-panel" aria-label="threetched binary surface">
  <header>
    <div>
      <p class="eyebrow">THREETCHED / 3TCHED-FS</p>
      <h2>Binary methods</h2>
      <p>Discovered from this caller's mounted filesystem. {visible.length} of {methods.length} methods
        in {sections.length - hiddenSections.size} of {sections.length} sections.</p>
    </div>
    {#if surface}<button type="button" disabled={loading || pending} onclick={() => void refresh()}>
      {loading ? "Discovering…" : "Refresh methods"}</button>{/if}
  </header>
  {#if !surface}
    <p role="status">Connect to the door to call threetched methods.</p>
  {:else}
    {#if loading}<p role="status">Reading the mounted method catalog…</p>{/if}
    {#if error && methods.length === 0}<p role="alert">{error}</p>{/if}
    {#if sections.length > 0}
      <div class="threetched-sections" role="group" aria-label="Method sections">
        <button type="button" onclick={() => setAllSections(true)}>All on</button>
        <button type="button" onclick={() => setAllSections(false)}>All off</button>
        {#each sections as [name, count] (name)}
          <button type="button" aria-pressed={!hiddenSections.has(name)} onclick={() => toggleSection(name)}>
            {name} <span>{count}</span></button>
        {/each}
      </div>
    {/if}
    <div class="threetched-browser">
      <div class="threetched-methods">
        <label for="threetched-method-search">Find a method</label>
        <input id="threetched-method-search" type="search" bind:value={query} placeholder="Search binary methods" />
        <div class="threetched-method-list" role="group" aria-label="Binary methods">
          {#each filtered as method (method.path)}
            <button type="button" disabled={pending} aria-pressed={selected?.method === method.method}
              onclick={() => choose(method)}>{method.method}</button>
          {/each}
          {#if filtered.length === 0}<p>No matching methods.</p>{/if}
        </div>
      </div>
      {#if selected}
        <div class="threetched-method-detail">
          <h3>{selected.method}</h3>
          <dl class="workbench-facts">
            <div><dt>Authority</dt><dd>Caller-bound binary mount</dd></div>
            <div><dt>Effect</dt><dd>{selected.declaration.side_effect}</dd></div>
            <div><dt>FUSE path</dt><dd>{selected.path}</dd></div>
          </dl>
          {#if selected.declaration.usage}<p>{selected.declaration.usage}</p>{/if}
          <details><summary>Argument schema</summary><pre>{JSON.stringify(selected.declaration.args, null, 2)}</pre></details>
          <label for="threetched-arguments">Arguments as JSON</label>
          <textarea id="threetched-arguments" rows="6" spellcheck="false" bind:value={argumentsText}></textarea>
          {#if selected.declaration.side_effect !== "read"}
            <label class="threetched-confirm"><input type="checkbox" bind:checked={confirmEffects} />
              Confirm {selected.declaration.side_effect} for {selected.method}</label>
          {/if}
          <button type="button" disabled={pending} onclick={() => void invoke()}>
            {pending ? "Calling…" : `Call ${selected.method}`}
          </button>
          <p role="status" aria-live="polite">{status}</p>
          {#if error}<p role="alert">{error}</p>{/if}
          {#if binaryOutput}
            <h4>{selected.method === "models.list" ? "Models" : "Output"}</h4>
            <pre>{binaryOutput}</pre>
          {/if}
          {#if result !== null}<details open><summary>Result</summary><pre>{JSON.stringify(result, null, 2)}</pre></details>{/if}
        </div>
      {/if}
    </div>
  {/if}
</section>
