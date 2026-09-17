# 3tched.com

The 3tched chat interface. A Vite + React + TypeScript app that renders a
Json Render chat surface and talks to the OP-DBUS control plane through its
one TLS door on port 8090.

This repository is the production frontend baseline. It replaces the retired
display stack (crates/op-web/ui, zeroclaw-gui, operation-dashboard-ui-07) and
was cut from the standalone vercel-json-render-ui workbench. Backend code lives
in repr0bated/operation-dbus-proto; nothing here talks to D-Bus, a broker, or a
model provider directly.

## How the wiring works

```
browser ──gRPC-Web/TLS──▶ op-grpc-bridge :8090 ──D-Bus──▶ tched_router plugin
             │
             └─ one generic RPC: operation.v1.PluginService/CallMethod
                { plugin_id, method_name, arguments[Value], capability_id }
                + exactly one identity credential in metadata (OIA1 or SID1)
```

- src/grpc/door.ts is the only module that touches the network. It wraps
  PluginService.CallMethod, attaches the identity metadata, declares the
  capability being exercised, and unwraps the bridge's audited envelope.
  Refusals come back from the gRPC status channel or the envelope's
  MutationError and are thrown as DoorError; nothing branches on a payload
  flag.
- src/chat/door-chat-adapter.ts implements the ChatAdapter seam against the
  sealed tched_router plugin:

  | ChatAdapter | tched_router method | declared capability |
  |---|---|---|
  | providers (load) | ListProviders + ListModels | cap.software.3tched-router.providers.read@v1, cap.software.3tched-router.models.read@v1 |
  | selectRoute | SetSelection | cap.software.tched-router.selection.set@v1 |
  | submit | Chat | cap.software.3tched-router.chat@v1 |

  Method names, argument shapes and capability ids were read from the live
  sealed schema (zcall help tched_router Chat and friends). A reseal that
  changes them makes the bridge refuse the call; the refusal is shown to the
  operator as-is.
- src/pages/ChatOnlyPage.tsx is the connect gate: door URL plus one pasted
  credential, or a host page can inject both through window.__3TCHED_CONFIG__
  and the app connects on load. "Use local workbench" keeps the deterministic
  in-browser adapter for UI work with no backend.

The UI never mints identity. A remote human presents the OIA1 assertion issued
to them by the Oracle decoy; a locally registered human presents their SID1
sealed id. The credential lives in memory for the life of the page and is not
written to storage. The door address is remembered in localStorage.

## Start locally

Requirements: Node.js 22.22.2 or newer, npm, and protoc if you regenerate the
gRPC stubs.

```bash
npm install
npm run dev
```

The dev server opens on the connect gate. To develop the UI without a door,
choose "Use local workbench".

### Reaching a real door from a browser

- The door is TLS only and speaks HTTP/2 only (ALPN h2); the cert is CN=svc0
  issued by "op-dbus local CA". The browser must trust that CA or the
  gRPC-Web fetch fails as "Failed to fetch". On the host the CA is at
  /etc/op-dbus/tls/tonic-svc0-ca.crt (root-readable directory); import it
  into the browser profile, e.g. for Firefox:
  certutil -d sql:$HOME/.config/mozilla/firefox/<profile> -A -n "op-dbus local CA" -t "C,," -i <ca.crt>
- The bridge's exact-origin CORS allowlist (OP_MCP_ALLOWED_ORIGINS in the
  op-grpc-bridge runit run script) must include the origin the UI is served
  from, for example http://127.0.0.1:8080 or http://localhost:5173. It fails
  closed: an unlisted origin gets a preflight with no allow-origin header.
- Set a build-time default with VITE_OPDBUS_DOOR=https://10.0.0.3:8090 in
  .env.local; the gate is pre-filled from it.
- A locally registered human gets their SID1 in gate form from the host:
  scripts/sid1-from-sled.sh (sudo; prints standard base64 of the sealed id).

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

## Publish through op-web

op-web serves static files from OP_WEB_STATIC_DIR. Publish beneath the path
op-web already serves for the json-render UI:

```bash
npm run deploy:op-web
```

URL_PREFIX and OP_WEB_STATIC_DIR override the mount path and target
directory. Static synchronisation does not require an op-web restart.

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
  pages/DoorConnectPanel.tsx  connect gate form
  pages/ChatOnlyPage.tsx      gate → JsonRenderProvider(adapter)
  json-render/                catalog, registry, page spec, runtime provider
```

## Provenance and license

Cut from the vercel-json-render-ui workbench with fresh history. The copied
catalog contract and stream plugin list originally came from
repr0bated/operation-dashboard-ui-07 at commit
1e72483c4227d12820419d4a901f3ef3dbf77dc9; see NOTICE. Json Render is
distributed by Vercel under Apache-2.0; the license text is in LICENSE.
