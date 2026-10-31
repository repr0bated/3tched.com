/** Allowed generative-UI stack for every page the chatbot renders. */
export function renderStackPrompt(): string {
  return [
    "Allowed render stack, available on every page:",
    "Svelte 5, SvelteKit, @json-render/core, @json-render/svelte, and Zod.",
    "A page spec is a flat { root, elements } map. Each element has a catalog type, props, and optional children keys.",
    "Use only components from the catalog in this request. The host does not draw the page.",
  ].join("\n");
}
