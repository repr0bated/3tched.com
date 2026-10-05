# Repository guidance

This is the 3tched chat interface: a SvelteKit + Vite + TypeScript Json Render app
wired to the OP-DBUS :8090 door. Backend work belongs in
repr0bated/operation-dbus-proto, not here.

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
  schema (zcall help tched_router <Method> on the host). Do not reconstruct
  them from Rust source. If a reseal changes them, update
  src/chat/door-chat-adapter.ts and its test together.
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
