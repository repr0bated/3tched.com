# Svelte chat reference

Layout and interaction reference:
https://github.com/vercel-labs/json-render/tree/fc2a696a50a30cb30c878ab1eb65e102487eea0f/examples/svelte-chat

Inspected `src/routes/+page.svelte` at that revision on 2026-10-05.
Adapted the centered empty state, suggestion chips, transcript with inline
results, multiline composer, clear action, and scroll-to-bottom behavior.

The implementation uses SvelteKit with adapter-static and the existing ChatAdapter. It does not
include the upstream SvelteKit API route, AI SDK transport, external data
tools, or upstream catalog. Catalog widgets, workspace tools, and privileged controls are implemented
as native Svelte components using `@json-render/svelte`.
