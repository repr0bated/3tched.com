<script lang="ts">
  import { onMount } from "svelte";
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
  let selectedName = $state("models");
  let argumentsText = $state('{"subcommand":"list"}');
  let confirmEffects = $state(false);
  let pending = $state(false);
  let result = $state.raw<unknown>(null);
  let error = $state("");
  let status = $state("Select a method to inspect its declaration.");
  let selected = $derived(methods.find((method) => method.method === selectedName) ?? methods[0]);
  let filtered = $derived(methods.filter((method) =>
    method.method.toLowerCase().includes(query.trim().toLowerCase()),
  ));
  let binaryOutput = $derived(
    result && typeof result === "object" && "stdout" in result && typeof result.stdout === "string"
      ? result.stdout : "",
  );

  async function refresh() {
    if (!surface || loading) return;
    loading = true;
    error = "";
    status = "Reading this caller's mounted ZeroClaw methods…";
    try {
      methods = await surface.describe();
      if (!methods.some((method) => method.method === selectedName)) {
        selectedName = methods[0]?.method ?? "";
      }
      status = `Discovered ${methods.length} methods from this caller's mount.`;
    } catch (caught) {
      methods = [];
      error = caught instanceof Error ? caught.message : "Mounted method discovery failed.";
      status = "Mounted ZeroClaw discovery failed.";
    } finally {
      loading = false;
    }
  }

  onMount(() => { void refresh(); });

  function choose(method: BinaryMethod) {
    selectedName = method.method;
    argumentsText = method.method === "models" ? '{"subcommand":"list"}' : "{}";
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

<section class="zeroclaw-panel" aria-label="ZeroClaw binary surface">
  <header>
    <div>
      <p class="eyebrow">ZEROCLAW / THREETCHEDFS</p>
      <h2>Binary methods</h2>
      <p>Discovered from this caller's mounted filesystem. {methods.length} methods.</p>
    </div>
    {#if surface}<button type="button" disabled={loading || pending} onclick={() => void refresh()}>
      {loading ? "Discovering…" : "Refresh methods"}</button>{/if}
  </header>
  {#if !surface}
    <p role="status">Connect to the door to call ZeroClaw methods.</p>
  {:else}
    {#if loading}<p role="status">Reading the mounted method catalog…</p>{/if}
    {#if error && methods.length === 0}<p role="alert">{error}</p>{/if}
    <div class="zeroclaw-browser">
      <div class="zeroclaw-methods">
        <label for="zeroclaw-method-search">Find a method</label>
        <input id="zeroclaw-method-search" type="search" bind:value={query} placeholder="Search binary methods" />
        <div class="zeroclaw-method-list" role="group" aria-label="Binary methods">
          {#each filtered as method (method.path)}
            <button type="button" disabled={pending} aria-pressed={selected?.method === method.method}
              onclick={() => choose(method)}>{method.method}</button>
          {/each}
          {#if filtered.length === 0}<p>No matching methods.</p>{/if}
        </div>
      </div>
      {#if selected}
        <div class="zeroclaw-method-detail">
          <h3>{selected.method}</h3>
          <dl class="workbench-facts">
            <div><dt>Authority</dt><dd>Caller-bound binary mount</dd></div>
            <div><dt>Effect</dt><dd>{selected.declaration.side_effect}</dd></div>
            <div><dt>FUSE path</dt><dd>{selected.path}</dd></div>
          </dl>
          {#if selected.declaration.usage}<p>{selected.declaration.usage}</p>{/if}
          <details><summary>Argument schema</summary><pre>{JSON.stringify(selected.declaration.args, null, 2)}</pre></details>
          <label for="zeroclaw-arguments">Arguments as JSON</label>
          <textarea id="zeroclaw-arguments" rows="6" spellcheck="false" bind:value={argumentsText}></textarea>
          {#if selected.declaration.side_effect !== "read"}
            <label class="zeroclaw-confirm"><input type="checkbox" bind:checked={confirmEffects} />
              Confirm {selected.declaration.side_effect} for {selected.method}</label>
          {/if}
          <button type="button" disabled={pending} onclick={() => void invoke()}>
            {pending ? "Calling…" : `Call ${selected.method}`}
          </button>
          <p role="status" aria-live="polite">{status}</p>
          {#if error}<p role="alert">{error}</p>{/if}
          {#if binaryOutput}
            <h4>{selected.method === "models" ? "Models" : "Output"}</h4>
            <pre>{binaryOutput}</pre>
          {/if}
          {#if result !== null}<details open><summary>Result</summary><pre>{JSON.stringify(result, null, 2)}</pre></details>{/if}
        </div>
      {/if}
    </div>
  {/if}
</section>
