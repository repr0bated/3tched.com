# 3tched.com

The 3tched chat interface. A SvelteKit + Svelte 5 + TypeScript chat that renders
inline Json Render results and talks to the OP-DBUS control plane through its
one TLS door on port 8090.

The SvelteKit route is `src/routes/+page.svelte`; `src/svelte/App.svelte` and
`Chat.svelte` own the shell, transcript, suggestions, multiline composer, and
scrolling. The design follows [Vercel's Svelte Chat example](https://github.com/vercel-labs/json-render/tree/main/examples/svelte-chat),
adapted to the existing `ChatAdapter`. SvelteKit runs as a browser-only app
using `adapter-static`, with `dist/index.html` and `dist/assets/` ready for the
existing op-web host. There is no new `/api/generate` server or chat transport.
For a subpath build, set `SVELTEKIT_BASE_PATH=/live` (no trailing slash); the
publish script translates its existing `LANDING`/`URL_PREFIX` options for you.
`chat-session.ts` keeps drafts, pending requests, errors, and inline results
separate for each door-confirmed conversation scope. Clear view only clears
the local transcript; it does not reset a remote server session.

Settings, mode and model controls, task authorization, the gallery, workspace
panels, and the typed `chatRegistry` are native Svelte components. Json Render
uses `@json-render/svelte`; there is no React runtime or compatibility bridge.
The workspace's ZeroClaw view discovers the binary method catalog through an
identity-bound threetchedfs mount. It lists every currently projected method,
its argument schema and effect. Each explicit call uses that same
caller-bound mount; results and refusals appear beside the method. The `models`
binary method with `subcommand: "list"` provides the ZeroClaw model list on request.
The ordinary 3tched model catalog
remains a separate source.
`runtime.svelte.ts` owns the reactive routing and scoped canvas state. Canvas
boards support pointer and keyboard reordering. The complete reference catalog
remains separate from the smaller runtime catalog.

This repository is the production frontend baseline. It replaces the retired
display stack (crates/op-web/ui, zeroclaw-gui, operation-dashboard-ui-07) and
was cut from the standalone vercel-json-render-ui workbench. Backend code lives
outside this repository; the caller-bound threetchedfs op-web route is in the
live `/srv/git/odbus-verified` source. Nothing here talks to D-Bus, a broker,
or a model provider directly.

## How the wiring works

```
browser ──gRPC-Web/TLS──▶ op-grpc-bridge :8090 ──D-Bus──▶ tched_router plugin
             │
             └─ one generic RPC: operation.v1.PluginService/CallMethod
                { plugin_id, method_name, arguments[Value], capability_id }
                + exactly one identity credential in metadata (OIA1 or SID1)
```

The ZeroClaw workspace also uses same-origin op-web routes for threetchedfs.
Each route verifies the browser's OIA1/SID1 through the door, opens a private
FUSE mount bound to that verified session, and reads the mounted method
declaration or call receipt. This path is separate from 3tched's model catalog.

- src/grpc/door.ts is the only module that touches the network. For 3tched it
  wraps PluginService.CallMethod, attaches the identity metadata, declares the
  capability being exercised, and unwraps the bridge's audited envelope. The
  ZeroClaw explorer uses its caller-bound threetchedfs route methods there.
  Refusals come back from the gRPC status channel or the envelope's
  MutationError and are thrown as DoorError; nothing branches on a payload
  flag.
- src/chat/door-chat-adapter.ts implements the ChatAdapter seam against the
  sealed tched_router plugin:

  | ChatAdapter | tched_router method | declared capability |
  |---|---|---|
  | providers (load) | GetState | cap.software.3tched-router.state.read@v1 |
  | selectRoute | SetSelection | cap.software.tched-router.selection.set@v1 |
  | submit | Chat | cap.software.3tched-router.chat@v1 |

  Method names, argument shapes and capability ids were read from the live
  sealed schema (zcall help tched_router Chat and friends). A reseal that
  changes them makes the bridge refuse the call; the refusal is shown to the
  operator as-is.
- src/svelte/connect.ts resolves identity, in order: injected by the
  host page through window.__3TCHED_CONFIG__; the page's own origin at
  GET /api/identity/self (op-web maps the WireGuard arrival's TCP source
  address to its identity-sled session and returns that session's SID1, so a
  human who came in over WireGuard is connected without touching anything);
  then the configured issuer, if present. Production builds include the public
  door and decoy issuer addresses from `.env.production`; environment variables
  or `.env.production.local` can override them. Publication checks that both
  addresses are included before replacing the served files. If identity lookup or connection
  fails, a retry panel fetches identity again without asking for credentials. "Use local
  workbench" keeps the deterministic in-browser adapter for UI work with no
  backend.

The UI never mints identity. A remote human presents the OIA1 assertion issued
to them by the Oracle decoy; a locally registered human presents their SID1
sealed id. The credential lives in memory for the life of the page and is not
written to storage. The door address can come from host configuration or the server identity response.

The /api/identity/self endpoint is op-web's (operation-dbus-proto
crates/op-web/src/handlers/identity_self.rs); which source addresses may
resolve which session is OP_WEB_HUMAN_PEERS in the op-web runit run script.
An absent endpoint, an unrecognized source address, or an invalid response
shows the identity retry panel. The browser never reads the sled database directly.

## Start locally

Requirements: Node.js 22.22.2 or newer, npm, and protoc if you regenerate the
gRPC stubs.

```bash
npm install
npm run dev
```

Without an identity endpoint or injected identity, the dev server opens on the retry panel. To develop the UI without a door,
choose "Use local workbench".

### Reaching a real door from a browser

- Over the configured WireGuard connection, open
  `http://dashboard.ghostbridge.tech:8080`. Private DNS resolves the hostname
  to the decoy's `10.0.0.1`; WireGuard-only forwarding reaches the UI and the
  existing Tonic door at `https://dashboard.ghostbridge.tech:8090`. The door
  uses a publicly trusted certificate, so browsers need no private CA import
  for this hostname. Public port 443 and Xray routing are unchanged.
- Internal clients on localhost and 10.0.0.3 retain the TLS certificate
  CN=svc0 issued by "op-dbus local CA". A browser using those addresses must trust that CA or the
  gRPC-Web fetch fails as "Failed to fetch". On the host the CA is at
  /etc/op-dbus/tls/tonic-svc0-ca.crt (root-readable directory). A public copy
  is included at [certs/op-dbus-ca.crt](certs/op-dbus-ca.crt); import it as a
  trusted certificate authority for websites in your browser on your own
  computer. This file contains only the public CA certificate, no private key.
  Its SHA-256 fingerprint is
  `12:1A:25:38:82:BD:97:B6:AB:73:14:41:3B:A7:BC:B3:07:77:4B:B2:56:B6:70:76:97:E4:6D:60:34:1E:F2:A6`.
  For an existing Firefox profile, the command-line equivalent is:
  `certutil -d sql:<your-firefox-profile-directory> -A -n "op-dbus local CA" -t "C,," -i certs/op-dbus-ca.crt`
- The bridge's exact-origin CORS allowlist (OP_MCP_ALLOWED_ORIGINS in the
  op-grpc-bridge runit run script) must include the origin the UI is served
  from, for example http://127.0.0.1:8080 or http://localhost:5173. It fails
  closed: an unlisted origin gets a preflight with no allow-origin header.
- Set a build-time default with VITE_OPDBUS_DOOR=https://dashboard.ghostbridge.tech:8090 in
  .env.local.
- For a browser on a remote computer through the decoy/WireGuard connection,
  build with VITE_OPDBUS_ISSUER=http://10.0.0.1:51888. The decoy must serve
  /identity/self and allow the exact UI origin (http://10.0.0.2:8080).
  It supplies the authenticated peer's OIA1 automatically. The browser uses
  separate, single-use assertions to resolve its session (`project.get_context`)
  and read that session's existing credential (`identity_sled.get_identity`).
  It then carries the server-authored SID1 in memory for chat and notifications.
  The decoy advertises https://dashboard.ghostbridge.tech:8090, reachable over the human's tunnel;
  the same door also remains available locally at 10.0.0.3:8090.
  Do not map the shared gateway IP to a human SID1.
- A locally registered human receives their existing SID1 automatically from
  the same-origin /api/identity/self endpoint. Credential entry is not part
  of the browser flow.

Smoke-test the whole path without a browser:

```bash
OPDBUS_DOOR_LIVE=https://10.0.0.3:8090 OPDBUS_SID1="$(scripts/sid1-from-sled.sh)" \
NODE_EXTRA_CA_CERTS=<readable copy of the CA> npx vitest run src/chat/door-live.test.ts
```

## Protocol stubs

proto/operation.proto is a verbatim copy of the bridge's contract; proto/
PROVENANCE records the source commit. src/grpc/gen is generated and committed.

```bash
npm run proto:gen
```

Only PluginService.CallMethod is used. No per-plugin stubs are generated on
purpose: the callable surface is the sealed catalog, and the browser calls one
generic RPC by semantic operation so a reseal never requires a UI rebuild.

## Publish the static files through op-web

op-web serves static files from OP_WEB_STATIC_DIR. This only syncs the built
files into that directory. The landing name chooses the mount: `live`, `prod`,
or `3tched` are ordinary names, and `URL_PREFIX=/` is the dashboard root. It
is not a deployment — the host is deployed by btrfs send/receive of a prepared
snapshot, which then carries whatever is in the static directory.

```bash
LANDING=prod npm run publish:op-web
URL_PREFIX=/ npm run publish:op-web
```

OP_WEB_STATIC_DIR overrides the target directory. Static synchronisation does
not require an op-web restart.

## Verification

```bash
npm run type-check
npm run lint
npm test
npm run build
```

## Project map

```text
proto/                        operation.proto copy + PROVENANCE
src/
  grpc/door.ts                the :8090 door client (only network code)
  grpc/gen/                   generated protobuf-ts stubs
  chat/chat-adapter.ts        the ChatAdapter seam
  chat/door-chat-adapter.ts   tched_router-backed adapter
  chat/local-chat-adapter.ts  deterministic in-browser adapter
  chat/door-config.ts         door URL / injected identity resolution
  routes/+page.svelte         SvelteKit chat entry
  routes/reference.html/      offline reference library route
  svelte/App.svelte           identity gate and native chat shell
  svelte/runtime.svelte.ts    routing, workspace, and scoped canvas state
  svelte/catalog/             native Svelte catalog components
  json-render/               reference contracts, typed registry, page specs
```

## Provenance and license

Cut from the vercel-json-render-ui workbench with fresh history. The copied
catalog contract and stream plugin list originally came from
repr0bated/operation-dashboard-ui-07 at commit
1e72483c4227d12820419d4a901f3ef3dbf77dc9; see NOTICE. Json Render is
distributed by Vercel under Apache-2.0; the license text is in LICENSE.

## Approved UI elements

The runtime catalog includes 100 additional common elements, named with the
`ui` prefix (for example `uiButton`, `uiTextInput`, `uiCard`, and `uiTabs`).
Run `npm run dev` and open `/ui-catalog` for a searchable offline preview with
copyable JSON examples and prop names for every element.

- Schemas: `src/json-render/catalog/ui-elements.ts`.
- Svelte implementations: `src/svelte/catalog/ui/`.
- Examples: `src/json-render/references/ui-element-examples.ts`.

All 100 are registered in the complete reference contract, `chatCatalog`,
`chatRegistry`, and the generated Canvas allowlist. They are also included in
`canvasProfileExport()`. No remote catalog promotion is needed to render them.

Controls maintain local browser/component state. `initialValue`,
`initialChecked`, and other `initial*` props seed a mounted control; they are
not backend bindings. Buttons emit `press`, editable controls emit `change`,
forms emit `submit`, and dialogs emit `close`. These are event notifications,
not value payloads. Generated Canvas specs still reject action bindings;
local form submission never sends a request. Links accept in-document
fragments only; downloads contain supplied plain text; avatars use initials.

```json
{
  "root": "card",
  "elements": {
    "card": { "type": "uiCard", "props": { "label": "Preferences" }, "children": ["name", "enabled"] },
    "name": { "type": "uiTextInput", "props": { "label": "Display name", "initialValue": "Alex" } },
    "enabled": { "type": "uiSwitch", "props": { "label": "Enable notifications", "initialChecked": true } }
  }
}
```
