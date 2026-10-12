<script lang="ts">
  import {
    uiElementSchemas,
    type UiElementName,
  } from "../json-render/catalog/ui-elements";
  import { uiElementExampleSpec } from "../json-render/references/ui-element-examples";
  import SpecRenderer from "./SpecRenderer.svelte";

  let { homeHref = "/" }: { homeHref?: string } = $props();
  let query = $state("");
  const names = Object.keys(uiElementSchemas) as UiElementName[];
  let filtered = $derived(
    names.filter((name) =>
      `${name} ${uiElementSchemas[name].description}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    ),
  );
  function example(name: UiElementName) {
    const spec = uiElementExampleSpec(name);
    if (uiElementSchemas[name].slots.length) {
      spec.elements.example.children = ["content"];
      spec.elements.content = {
        type: "uiParagraph",
        props: { text: "Nested content renders here." },
      };
    }
    return spec;
  }
</script>

<!-- Focus lets keyboard users scroll the catalog without entering a control. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<main class="ui-library" aria-label="UI component catalog" tabindex="0">
  <header>
    <a href={homeHref}>Back to chat</a>
    <h1>100 everyday UI elements</h1>
    <p>
      Approved Svelte components for JSON Render. Try the controls and copy an
      example spec. Changes stay in this preview.
    </p>
    <label
      >Find an element <input
        type="search"
        bind:value={query}
        placeholder="Search names and descriptions"
      /></label
    >
    <p role="status" aria-live="polite">
      {filtered.length} of {names.length} elements
    </p>
  </header>
  <div class="ui-library-grid">
    {#each filtered as name (name)}
      <article id={name}>
        <h2>{name}</h2>
        <p>{uiElementSchemas[name].description}</p>
        <div class="ui-library-preview">
          <SpecRenderer spec={example(name)} />
        </div>
        <details>
          <summary>JSON example and props</summary>
          <p>
            Props: {Object.keys(uiElementSchemas[name].props.shape).join(", ")}
          </p>
          <pre><code>{JSON.stringify(example(name), null, 2)}</code></pre>
        </details>
      </article>
    {/each}
  </div>
</main>

<style>
  .ui-library {
    box-sizing: border-box;
    width: 100%;
    height: 100dvh;
    overflow-y: auto;
    max-width: 90rem;
    margin: auto;
    padding: 2rem;
    color: var(--text, #e2e8f0);
  }
  header {
    max-width: 48rem;
    margin-bottom: 2rem;
  }
  header label {
    display: grid;
    gap: 0.5rem;
  }
  input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #64748b;
    border-radius: 0.4rem;
    background: transparent;
    color: inherit;
  }
  .ui-library-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 23rem), 1fr));
    gap: 1rem;
    align-items: start;
  }
  article {
    padding: 1.25rem;
    border: 1px solid #64748b;
    border-radius: 0.75rem;
    min-width: 0;
  }
  h2 {
    font-size: 1.1rem;
  }
  article > p {
    font-size: 0.9rem;
    opacity: 0.8;
  }
  .ui-library-preview {
    padding: 1.5rem 0.25rem;
    min-height: 4rem;
  }
  pre {
    overflow: auto;
    max-height: 24rem;
    font-size: 0.8rem;
  }
  summary {
    cursor: pointer;
  }
  .ui-library:focus-visible,
  :is(a, input, summary):focus-visible {
    outline: 2px solid #818cf8;
    outline-offset: 3px;
  }
</style>
