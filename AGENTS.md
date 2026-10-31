# Repository guidance

This is the 3tched chat interface: a SvelteKit + Vite + TypeScript Json Render app
wired to the OP-DBUS :8090 door. Backend work belongs in
repr0bated/operation-dbus-proto, not here.

- Use only Svelte/SvelteKit, Vite and json-render's Svelte renderer for this
  application's UI, for every user and chat mode. Every visible element must
  be declared in the active catalog and implemented in its registry. Installed
  skills for other frameworks are reference material only: do not add
  React/JSX/Next.js components, another
  renderer, or framework dependencies. Use compatible framework-independent
  guidance only. Apply the UI-authoring preflight in all modes while preserving
  each caller's existing grants; skills never grant file or operation access.
  Exception: Remotion, AI Elements (vercel/ai-elements), and Streamdown
  (vercel/streamdown) code and patterns may be used as-is, including their
  native React runtime, scoped strictly to the surfaces that need them
  (e.g. a Remotion video player, an AI Elements chat transcript, or
  Streamdown markdown rendering). Mount each such surface behind its own
  explicit boundary (e.g. a dedicated custom element/iframe host component)
  rather than letting React leak into the rest of the tree; the json-render
  Svelte renderer remains the only renderer for everything outside that
  boundary, and the one-door/one-credential rules below still apply to any
  network calls those surfaces make. The active catalog itself stays
  Svelte/Vite/json-render only: when adding anything to the active catalog
  (src/json-render/catalog/chat-catalog.ts) and its registry
  (src/json-render/catalog/chat-registry.ts), the entry's schema and its
  registered component must be a native Svelte component implemented with
  only Svelte/SvelteKit, Vite, and json-render's Svelte renderer. A React
  boundary host (Remotion/AI Elements/Streamdown) is never registered in the
  active catalog directly — wrap it in a plain Svelte component that owns
  mounting/unmounting the React tree internally, and register only that
  Svelte wrapper. No raw React/JSX ever appears in chat-catalog.ts,
  chat-registry.ts, or the schemas they expose.
- One door. All network code lives in src/grpc/door.ts and goes through
  operation.v1.PluginService/CallMethod with a declared capability. Do not add
  a second transport, a parallel frontend backend, per-plugin generated stubs,
  or any direct HTTP to op-web for chat.
- One credential. A request carries exactly one of OIA1 or SID1 as binary
  metadata. The UI never mints, derives, or persists a credential; the retired
  pairing flow (/pair, paircode) must not come back.
- Errors come from the status channel. Read gRPC status and the envelope's
  MutationError; never branch on a success boolean in a payload.
- Method names, argument shapes, and capability ids come from the live sealed
  schema (zcall help chat_response <Method> / model_registry / catalog binding
  on the host). Do not reconstruct them from Rust source. If a reseal changes
  them, update src/chat/door-chat-adapter.ts, chat-response-client.ts, and
  their tests together. Chat replies are committed `chat_response` turns only —
  never retired `tched_router.Chat` or `json_render.generate_spec`.
- Keep backend work behind ChatAdapter. The local adapter must stay usable with
  no credentials, service, or network so UI work can proceed offline.
- Keep src/json-render/catalog/catalog.ts as the complete reference contract.
  Runtime components live in the smaller chatCatalog and typed chatRegistry;
  adding a schema to the reference catalog does not make it safe to render.
- Preserve accessible labels, keyboard behavior, visible focus states, and
  aria-live status messaging.
- proto/operation.proto is a verbatim copy; refresh it from the bridge and
  record the commit in proto/PROVENANCE, then run npm run proto:gen. Never
  hand-edit proto/ or src/grpc/gen/.
- Run npm run type-check, npm run lint, npm test, and npm run build before
  committing.
- SvelteKit 3 does not use `svelte.config.js`. vite-plugin-svelte options and
  kit settings live in `svelte-vite-options.ts` and are passed to `sveltekit()`
  from `vite.config.ts` (Vitest uses `svelte({ configFile: false, ... })`).
