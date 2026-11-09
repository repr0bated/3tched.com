<script lang="ts">
  import { Renderer, JsonUIProvider } from '@json-render/svelte';
  import { onMount } from 'svelte';

  export let data: {
    cozoRelations: unknown[] | null;
    cmsSpec: Spec | null;
    error: string | null;
    chunksUsed: number;
    generatedAt: string;
    published: boolean;
  } = {} as any;

  // Local state — overwritten by onMount from localStorage.
  let draft = {
    cozoRelations: data.cozoRelations,
    cmsSpec: data.cmsSpec,
    error: data.error,
    chunksUsed: data.chunksUsed,
    generatedAt: data.generatedAt,
    published: data.published,
  };

  /** Hydrate draft from localStorage on client mount. */
  onMount(() => {
    const gen = localStorage.getItem('cms-generation');
    if (gen) {
      try {
        const d = JSON.parse(gen);
        draft = {
          cozoRelations: d.cozo_relations ?? null,
          cmsSpec: d.cms_spec ?? null,
          error: null,
          chunksUsed: d.chunks_used ?? 0,
          generatedAt: d.generated_at ?? '',
          published: d.published ?? false,
        };
      } catch { /* stale draft — ignore */ }
    }
  });
  let generating = false;
  let error: string | null = null;

  async function generate() {
    generating = true;
    error = null;
    try {
      const response = await fetch('/api/cms-generate', { method: 'POST' });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Generation failed');
      }
      localStorage.setItem('cms-generation', JSON.stringify({
        cozo_relations: result.cozo_relations,
        cms_spec: result.cms_spec,
        chunks_used: result.chunks_used,
        generated_at: new Date().toISOString(),
        published: false
      }));
      location.reload();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unknown error';
    } finally {
      generating = false;
    }
  }

  async function publish() {
    error = null;
    try {
      const gen = localStorage.getItem('cms-generation');
      if (!gen) throw new Error('Nothing to publish');
      const draft = JSON.parse(gen);
      const response = await fetch('/api/cms-publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cozo_relations: draft.cozo_relations,
          cms_spec: draft.cms_spec
        })
      });
      const result = await response.json();
      if (!response.ok || !result.committed) {
        throw new Error(result.error || 'Publish did not commit both');
      }
      draft.published = true;
      localStorage.setItem('cms-generation', JSON.stringify(draft));
      location.reload();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Publish failed';
    }
  }

  async function deny() {
    localStorage.removeItem('cms-generation');
    location.reload();
  }
</script>

<div class="min-h-screen bg-gray-50">
  <div class="bg-white border-b border-gray-200 px-4 py-3">
    <div class="max-w-6xl mx-auto flex items-center justify-between">
      <h1 class="text-xl font-semibold text-gray-900">CMS Generator</h1>
      <span class="text-sm text-gray-500">
        {draft.published ? 'Published' : draft.cmsSpec ? 'Draft — review' : 'Ready'}
      </span>
    </div>
  </div>

  <div class="max-w-6xl mx-auto px-4 py-6 space-y-6">
    {#if !draft.cmsSpec && !error}
      <div class="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <h2 class="text-lg font-medium text-gray-900 mb-2">Generate Compliance CMS</h2>
        <p class="text-gray-500 mb-4">
          Query Qdrant compliance data → Generate Cozo relations + CMS spec → Review → Publish
        </p>
        <button
          class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md font-medium"
          on:click={generate}
          disabled={generating}
        >
          {generating ? 'Generating...' : 'Generate'}
        </button>
      </div>
    {:else}
      {#if error}
        <div class="bg-red-50 border border-red-200 rounded-lg p-4">
          <p class="text-red-800 font-medium">Error: {error}</p>
          <button class="mt-2 text-red-600 hover:text-red-700 text-sm" on:click={() => { error = null; location.reload(); }}>Try again</button>
        </div>
      {/if}

      {#if draft.cozoRelations}
        <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div class="bg-gray-50 px-4 py-3 border-b border-gray-200">
            <h2 class="text-lg font-medium text-gray-900">Cozo Relations</h2>
            <p class="text-sm text-gray-500">{draft.cozoRelations.length} relations · {draft.chunksUsed} Qdrant chunks</p>
          </div>
          <div class="p-4">
            <pre class="text-xs bg-gray-50 rounded-lg p-4 overflow-x-auto max-h-96">
{JSON.stringify(draft.cozoRelations, null, 2)}
            </pre>
          </div>
        </div>
      {/if}

      {#if draft.cmsSpec}
        <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div class="bg-gray-50 px-4 py-3 border-b border-gray-200">
            <h2 class="text-lg font-medium text-gray-900">CMS Spec</h2>
            <p class="text-sm text-gray-500">
              Generated {draft.generatedAt} · {draft.published ? 'Published' : 'Draft'}
            </p>
          </div>
          <div class="p-4">
            <JsonUIProvider>
              <Renderer spec={draft.cmsSpec as Spec} registry={chatCatalog} />
            </JsonUIProvider>
          </div>
        </div>
      {/if}

      {#if draft.published}
        <div class="bg-green-50 border border-green-200 rounded-lg p-4">
          <p class="text-green-800 font-medium">✓ Published — both Cozo relations and CMS spec committed</p>
        </div>
      {/if}

      {#if draft.cmsSpec && !draft.published}
        <div class="flex items-center gap-4 bg-white rounded-lg border border-gray-200 p-4">
          <button class="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-md font-medium" on:click={publish}>✓ Publish (commit both)</button>
          <button class="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-md font-medium" on:click={deny}>✗ Deny (commit neither)</button>
        </div>
      {/if}
    {/if}
  </div>
</div>
