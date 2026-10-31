# 3tched.com

The 3tched chat interface: an edge-to-edge Json Render canvas with an initially
open, collapsible chatbot pane floating on the left. The model picker stays
visible above chat. SvelteKit, Svelte 5 and Vite build static assets for the
existing OP-DBUS server on port 8080; identity, committed chat responses, model
routing, grants and catalog admission continue through the one door on 8090.

The SvelteKit route is `src/routes/+page.svelte`; `src/svelte/App.svelte` owns
the full-viewport canvas, floating toolbar, chat pane and optional tools panel.
`Chat.svelte` owns the transcript, multiline composer and scrolling. Loading
renders a blank canvas and an empty chat pane: no headings, suggestions, copy
or placeholder specs. All visible UI arrives through the chatbot, which
subscribes to the rendering catalog; the chatbot's specs render on the canvas,
and anything outside the catalog is rejected by the json-render API before it
can render. Hide/show chat preserves drafts, model selection, conversation
and canvas state; it never reserves a sidebar column or changes canvas width.
The model selector retains the existing identity-scoped model-change rules.
Settings still contains mode and knowledge controls; Tools contains the existing
workspace navigation, inspection, gallery, authorization and other panels.

The design follows [Vercel's Svelte Chat example](https://github.com/vercel-labs/json-render/tree/main/examples/svelte-chat),
adapted to the existing `ChatAdapter`. SvelteKit uses `adapter-static`, with
`dist/index.html` and `dist/assets/` for op-web. There is no standalone Gateway
server, new `/api/generate`, replacement identity path or second chat transport.
`chat-session.ts` keeps drafts, pending requests and errors separate per
door-confirmed scope. Clear view does not reset a remote server session.

After a remote connection and the door-confirmed chat context load, the app
requests the initial interface on the canvas through the same
`chat_response` committed-turn path used for ordinary chat (`response_mode:
application`). No switch away from the selected mode is required; the request
does not add a transcript turn or save/promote a gallery entry. The UI shows
a reply only after `get_turn_response` returns the designated responder's
commit. Chat and privileged controls remain trusted application components; a
generated presentation cannot grant permissions.

Generation runs once per selected conversation scope. Loading and failures
are visible in the catalog-backed `interfaceGeneration` component, with an
explicit retry after failure. Late responses cannot cross a scope change,
update an unmounted runtime, or overwrite a newer user-requested canvas.
The local workbench remains offline and does not generate on startup.
Production requires a matching sealed backend exposing `chat_response`
submit/read methods. Retired `tched_router.Chat` and `json_render.generate_spec`
are not used as the response path.

Settings, mode and model controls, task authorization, the gallery, workspace
panels, and the typed `chatRegistry` are native Svelte components. Json Render
uses `@json-render/svelte`; there is no React runtime or compatibility bridge.
The workspace's threetched view discovers the native binary method catalog
through an identity-bound 3tched-fs mount. It accepts only the canonical
`threetched` plugin, nonempty dot-separated command segments, and the exact
`plugins/threetched/operations/<method>/call` path. The declaration's name must
match the method; its supplied `cap.software.threetched.call.c<64-hex>@v1`
capability must match its `mut.*` subid. Capabilities remain opaque, are never
inferred from command names, and do not grant access in the browser; admission
belongs to the caller-bound mount.
The view lists each declared method, argument schema and effect. Each explicit
call uses that same mount; results and refusals appear beside the method.
The native `models.list` command takes `{}` to list models; it does not take a
legacy `subcommand: "list"` argument. Like `skills.add`, its currently sealed
effect is `mutation`, so the UI requires explicit confirmation. The ordinary
3tched model catalog remains a separate source.
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
browser ──gRPC-Web/TLS──▶ op-grpc-bridge :8090 ──D-Bus──▶ chat_response (+ catalog)
             │
             └─ one generic RPC: operation.v1.PluginService/CallMethod
                { plugin_id, method_name, arguments[Value], capability_id }
                + exactly one identity credential in metadata (OIA1 or SID1)
```

The threetched workspace also uses the existing same-origin op-web routes for threetchedfs.
Each route verifies the browser's OIA1/SID1 through the door, opens a private
FUSE mount bound to that verified session, and reads the mounted method
declaration or call receipt. This path is separate from 3tched's model catalog.

- src/grpc/door.ts is the only module that touches the network. For 3tched it
  wraps PluginService.CallMethod, attaches the identity metadata, declares the
  capability being exercised, and unwraps the bridge's audited envelope. The
  threetched explorer uses its caller-bound threetchedfs route methods there.
  Refusals come back from the gRPC status channel or the envelope's
  MutationError and are thrown as DoorError; nothing branches on a payload
  flag.
- src/chat/door-chat-adapter.ts implements the ChatAdapter seam against the
  sealed plugin methods (`src/chat/chat-response-client.ts` owns the turn flow):

  | Operation | Method | Declared capability |
  |---|---|---|
  | Model catalog | `model_registry.list_providers` / `list_models` | `model_registry.read` |
  | Ordinary model selection | catalog binding apply/resolve | `cap.software.tched-router.catalog.selection.set@v1` / binding read |
  | Start conversation | `chat_response.start_conversation` | `chat_response.read` |
  | Human submit | `chat_response.submit_turn` | `chat_response.submit` |
  | Committed reply | `chat_response.get_turn_response` | `chat_response.read` |
  | Chatbot's own model | `tched_router.apply_own_agent_route` | `cap.software.tched-router.agent.route.self.write@v1` |

  Argument shapes and capability IDs must match the deployed sealed schemas.
  A mismatched release makes the bridge refuse the call; the refusal is shown to the
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

## UI Render candidates and promotion

Any authenticated identity can propose a static Canvas/application and save its
own private candidate. UI Render submits through `chat_response` with
`response_mode: application` and renders only after the designated responder
commits; it neither applies a global model selection nor requires retired
`tched_router.Chat` authority. Invalid committed Canvas is not rendered.

Use **Suggest promotion** to submit a saved candidate for review. Submission
does not publish it to the shared catalog. Root reviewers can preview submitted
specs and promote the exact submitted version; they cannot browse another
identity's unsubmitted drafts or private prompt. Published entries distinguish
the original creator from the promoting identity. Deleting a candidate removes
its pending suggestion.

Promotion requires application `$ROOT` membership and `json_render.promote`,
not a password prompt or the backend's Unix UID. Retirement keeps its separate
`json_render.retire` capability and elevation. The canonical Control Plane
chatbot also changes its own model without elevation when the server confirms
its session, root membership and scoped model-write grant. Human administrative
configuration changes remain elevated; a failed scoped change never retries
through the broader administrative operation.

Deploy this UI together with the matching backend, grants and resealed method
contracts. Tests and browser verification for these changes are deferred until
after deployment. Then verify ordinary-user generation/submission, denial of
ordinary-user promotion, root review/promotion with both authors retained, and
password-free model changes from the actual Control Plane chatbot identity.

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

The currently running op-web service uses
`/usr/local/share/op-dbus/dashboard-release`, not the publish script's historical
`dashboard` default. To replace the interface at the existing port-8080 root:

```bash
OP_WEB_STATIC_DIR=/usr/local/share/op-dbus/dashboard-release URL_PREFIX=/ npm run publish:op-web
```

This builds and transfers the frontend only; it does not replace the backend,
restart services, modify credentials, or deploy the unrelated `/srv/git/3tched`
checkout. The full host release snapshot remains a separate operator action.

When the served directory is a read-only release mount, the publisher stages
assets under `/var/lib/op-dbus/dashboard-overlay-<timestamp>` and bind-mounts
only `assets/` and `index.html` over their served paths. The snapshot itself
stays unchanged. This is a runtime override: reboot or full release activation
restores the release's frontend, so rerun the publication command afterwards
until the UI is included in a new prepared release snapshot.

Publication receipt (2026-10-27 12:21 UTC): `npm run publish:op-web` completed
the required Vite build and published the canvas layout through
`/var/lib/op-dbus/dashboard-overlay-20261027T1221Z`. Both frontend paths were
overlaid at the active `dashboard-release` root. No backend restart or
credential change was performed. Build warnings remain in the existing
`ApplicationRenderer`, `FeedBoundCanvas` and `applicationOverlay` initial-prop
captures, plus the existing large client chunk. No browser/model-flow checks,
type-check command, lint or test suite was run.

After publishing, manually reload the page on port 8080, confirm chat opens on
the left with its model controls, submit an interface request, hide/show chat,
and confirm the generated UI fills the same edge-to-edge canvas. Check draft
and model selection retention, narrow-screen controls, and the Tools panel.
Browser verification and tests are manual/on-request; they were not run for
this layout update.

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
  chat/door-chat-adapter.ts   door ChatAdapter (committed chat_response turns)
  chat/chat-response-client.ts submit_turn → get_turn_response display path
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
