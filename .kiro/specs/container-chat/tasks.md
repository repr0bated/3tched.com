# Implementation Plan — Container chat

Draft only. Do not start these tasks until the owner approves them. Chat is
the piece that changes. Do not redeploy the network bridge and do not
rebuild the 3tched base to begin this list.

This plan supersedes `.kiro/specs/identity-chat-interface/tasks.md`. The
identity-chat spec and `crates/op-chat-interface` in `/srv/git/odbus-verified`
are retained until the container chat is deployed and verified. The container
owns runtime chat. The container calls 3tched for the gate, memory, the
cognitive layer, and 3tchedFS. The container calls the threetched binary for
models, providers, and skills.

Execution order:

1. Discovery and records (read-only).
2. Container scaffold: types, errors, config files.
3. Secret_Guard: credential registry, stream guard, output gating.
4. Profile_Loader and Session_Mode resolution.
5. Schema_Validator and Operation_File adapter.
6. Confirmation_Gate.
7. Tool_Executor: Operation_File calls, read-back, timeout, unknown outcome.
8. Chat_Route turn loop: AI SDK, model provider, tool-call limit.
9. Chat_Link: gRPC-Web transport between browser and Chat_Route server.
10. Chat_UI: SvelteKit, Svelte 5, json-render, Chat component.
11. Chain verifier: Receipt-to-Execution_Record linkage.
12. Plugin feeds over the chat link.
13. Legacy chat cutover: retire the Host_Dashboard path.
14. End-to-end checks.

## Tasks

### Task 1: Read-only discovery and records

All sub-tasks are read-only. No login, start, stop, restart, logout, mount,
unmount, grant, storage, identity, or deployment change (Req 1.6).
Every observation is redacted before writing: Credential_Material is replaced
by a marker naming only the field (Req 5.5, 5.9).

- [ ] 1.1 Write the Baseline_Record for every pinned interface the Chat_Interface uses
  - Cover `identity_sled` methods (`get_own_identity`, `get_identity`,
    `get_session_history`, `record_session_event`, `touch_session`,
    `refresh_credential`), `op-execution-tracker` (`ExecutionRecord`,
    `verify_integrity`, `hash_execution`), Sealed_Method_Schema format
    (`MethodDecl`, `SideEffect`, `required_capability`), Operation_File
    contract (3tchedFS `mounted.rs`), `MethodExecutionReceipt`, Door_8090,
    and the Op_Web_Connector.
  - For each: path relative to `/srv/git/odbus-verified`, symbol, pinned
    commit hash, signature, committed-or-WT flag.
  - Create a Blocker_Record for each symbol absent at the pinned commit or
    with a differing signature.
  - Record the `mount-3tchedfs` catalog defect with helper command, error
    text, and timestamp. The op-dbus source fix exists and is not deployed.
  - Record the `crates/threetched-fs` directory name as a pinned naming
    defect.
  - _Requirements: 1.1, 1.7, 1.9, 1.11_

- [ ] 1.2 Write the Runtime_Record for the container and 3tched surfaces
  - For the Identity_Container and the 3tched base (the Host_Dashboard path
    is retired — Req 13.2): present or absent for the `3tched` view,
    the `threetched` view, the Lungs_Socket, Door_8090, and the
    Op_Web_Connector, with exact command, output, and UTC timestamp.
  - Record the Lungs_Socket path (`/run/opdbus/lungs/lungs.sock`), Door_8090
    (`10.0.0.2:8090`), and Op_Web_Connector (`10.0.0.2:8080`) status.
  - Record in-container egress: no direct IP; all calls through the
    Lungs_Socket (Req 9.2).
  - _Requirements: 1.2, 1.3, 1.6, 1.9_

- [ ] 1.3 Record the Bound_Identity and Execution_Record operations per container
  - Identify the Bound_Identity from a `get_own_identity` Receipt through
    the container's mounted Operation_File. Record Public_Identity_Fields
    and the Receipt.
  - Run discovery on the mounted catalog and method declarations, recording
    method names and Required_Capabilities or explicit "none".
  - Record candidate fields for principal id and SID1/OIA1 grammar source.
  - Read `chat_fs.get_protocol` for diagnostic kinds.
  - _Requirements: 1.4, 1.5, 1.8, 1.9, 2.1_

- [ ] 1.4 Build the Legacy_Chat_Inventory
  - Search `/srv/git/odbus-verified` and `/srv/git/3tched.com` read-only
    for existing chat code.
  - Per item record: path, symbol, pinned commit, callers traced in source,
    classification (chat code to remove, identity/grant/storage binding to
    keep, threetched-backed service to keep, unclear).
  - Run the credential check on every source excerpt first. Never send
    SID1, OIA1, keys, `.env` content, grant files, or identity records.
  - Classify `ctl_plane_chatbot` as kept and integrated. Classify
    `chat_router*` and other threetched-backed services as kept (naming
    defects). List every item whose role is unclear for the owner.
  - _Requirements: 13.1, 13.2, 13.3_

- [ ] 1.5 Record the threetched naming defects
  - Record `chat_router` (renamed from `tched_router`) and every other
    `chat_*` or `tched_router` name on a threetched-backed service as a
    naming defect, with path and pinned commit.
  - Record the `ctl_plane_chatbot` coupling to `chat_router` types, limits,
    and plugin id as a 3tched-on-threetched dependency to cut.
  - _Requirements: 13.3, 13.6_

### Task 2: Project scaffold and shared types

- [ ] 2.1 Create the `apps/chat/` scaffold
  - Create `package.json` with exact versions for every Pinned_Package_Set
    entry: `@ai-sdk/svelte`, `ai`, `@sveltejs/kit`, `vite`, `typescript`,
    `@tailwindcss/vite`, `@tailwindcss/forms`, `tailwindcss`, `shiki`,
    and `fast-check` 4.10.2 as a dev dependency.
  - Create `svelte.config.js`, `vite.config.ts`, `tsconfig.json` (strict),
    `.gitignore` covering `node_modules/` and `.runtime/`, and the empty
    directory layout: `src/lib/server/`, `src/lib/client/`, `src/lib/catalog/`,
    `src/routes/`, `scripts/`, `tests/property/`, `tests/unit/`,
    `tests/fixtures/synthetic/`.
  - No React, JSX, TSX, or Next.js file or dependency. No MCP client or
    transport.
  - _Requirements: 12.1, 12.2, 12.4, 12.6, 12.7_

- [ ] 2.2 Define shared types, typed errors, and configuration files
  - Create `src/lib/server/types.ts` with: `PrincipalId`, `ChatSessionId`,
    `ToolKey`, `ViewKind`, `CatalogPin`, `HeldCapabilityResult`,
    `PendingToolCall`, `ToolCallStatus`, `ToolCallStatusUpdate`,
    `ReceiptSummary`, `BoundIdentityRecord`, `PublicIdentityFields`,
    `ChatSession`, `IdentityProfile`, `BlockerRecord`, `SecurityEvent`,
    `CredentialClass`, `ExecutionRecordView`.
  - Create `src/lib/server/errors/typed-error.ts`: `TypedError` with
    exactly one of eight kinds: `missing-mount`, `transport`, `provider`,
    `schema`, `configuration`, `unknown-outcome`, `denial`, `validation`.
    Each carries `failingItem` and `nextStep` looked up from the error
    config.
  - Create `config/read-back.json` as an empty map and
    `config/naming-defect-exclusions.json` as an empty list.
  - _Requirements: 15.6, 8.12, 13.6_

### Task 3: Secret_Guard

- [ ] 3.1 Implement credential registry and `checkItem`
  - Held-value rule: complete values and every contiguous 16-byte window,
    precomputed per encoding (raw UTF-8, base64 at all three byte
    alignments, base64url, hex both cases, percent-encoding, JSON string
    escaping) into a partition-local in-memory set. Nothing derived from a
    held value is logged, persisted, or hashed.
  - Envelope rule: `SID1` or `OIA1` followed by 16+ characters of
    `[A-Za-z0-9+/=_.:-]` in every listed encoding.
  - Declared-secret field rule: JSON members named `sealed_id` or carrying
    `x-oscal-subid` `src.service.identity-sled.sealed-id@v1`.
  - `registerHeld(cls, value)` per partition; verdict is `{ clean } | {
    clean: false, cls } | { error }`.
  - _Requirements: 5.5, 5.1, 5.2, 1.9, 13.6_

- [ ] 3.2 Write property test for held-value and envelope detection
  - Validates: Requirements 5.5, 1.9, 13.6

- [ ] 3.3 Implement stream guard with chunk hold-back
  - Hold back 15 bytes for raw windows and the encoded window length minus
    one for encoded windows. Check `heldBack + chunk`. Release only bytes
    that can no longer join a window. A match blocks the chunk and the held
    bytes. `end()` checks and flushes the tail.
  - _Requirements: 5.5, 5.6_

- [ ] 3.4 Write property test for chunk-split detection
  - Validates: Requirements 5.5, 5.6

- [ ] 3.5 Implement fail-closed output gating and record writers
  - Wrap every outbound channel (`model-context`, `ui-stream`, `log`,
    `telemetry`, `persisted-server`, `persisted-client`) with a 2 000 ms
    check limit. Detection, error, or timeout withholds the whole item
    and emits a `blocked-output` or credential-check typed error.
  - Create `records/security-events.ts` and `records/blocker-records.ts`:
    JSON lines under `.runtime/`, every field passed through the guard, no
    part, window, or digest of a detected value.
  - Typed-error fields are redacted with a class-only marker before return.
  - _Requirements: 5.2, 5.6, 5.7, 13.8, 15.9, 13.7_

- [ ] 3.6 Write property test for fail-closed detection
  - Validates: Requirements 5.1, 5.2, 5.6, 5.7, 13.8, 15.9

- [ ] 3.7 Implement request-intake checking
  - Check every field of turn, decision, and re-verify requests before they
    reach the turn loop, context builder, executor, or logger. A match
    rejects the request with a credential-refused error, no state change,
    and one security event.
  - _Requirements: 5.8_

- [ ] 3.8 Write property test for intake refusal
  - Validates: Requirements 5.8

### Task 4: Profile_Loader and Session_Mode

- [ ] 4.1 Write `config/identity-profile.schema.json` and `profile/profile-loader.ts`
  - JSON Schema 2020-12, `additionalProperties: false` everywhere,
    `format`, `principal_id`, `display_name`, optional `expected_session_id`
    and `session_mode`, `deployment_targets[]` with `kind` and `mount_paths`
    holding exactly the `3tched` and `threetched` keys.
  - `parse`: size check (<= 65 536 bytes) before decoding, strict UTF-8,
    duplicate-key-rejecting `JSON.parse`, Ajv validation, Secret_Guard pass
    on every string, immutable result. Errors name field path and rule,
    never the value.
  - `format`: canonical JSON in schema key order, list order preserved.
  - Session_Mode resolution: exactly `standard`, `control_plane` or
    `ui_build`, otherwise `standard`. Limit 5000 for `control_plane` and
    `ui_build`, 5 for `standard`. The standard value must stay 1..10.
    A non-string `session_mode` is a type error.
  - _Requirements: 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 15.7, 15.8_

- [ ] 4.2 Write property test for profile round trip
  - Validates: Requirements 13.6, 13.7

- [ ] 4.3 Write property test for profile rejection
  - Validates: Requirements 13.5, 13.8

- [ ] 4.4 Write property test for Session_Mode resolution
  - Validates: Requirements 15.7, 15.8

### Task 5: Schema_Validator

- [ ] 5.1 Implement schema validation in the executor and operation-file adapter
  - `Ajv2020` with `strict: false`, `allErrors: true`, `coerceTypes: false`,
    `useDefaults: false`, `removeAdditional: false`, `ajv-formats`.
  - Non-JSON inputs fail with path `""` and constraint `type`. Failures list
    path and keyword, never the value.
  - Render the accepted value once with `JSON.stringify` into `inputBytes`.
    Reject over the 1 MiB argument bound.
  - _Requirements: 8.3, 8.8, 8.9_

- [ ] 5.2 Write property test for out-of-schema rejection
  - Validates: Requirements 8.3, 8.8

### Task 6: Confirmation_Gate

- [ ] 6.1 Implement `gate/confirmation-gate.ts`
  - Holds pending mutation calls with validated input and computed digest.
    Accepts approve or reject from the Chat_UI as a separate request.
    Digest is SHA-256 of context + input.
    Atomically consumes each event for at most one call.
    Pending calls expire at 300 seconds.
    Discards on restart or session end.
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9_

- [ ] 6.2 Write property test for atomic consumption and expiry
  - Validates: Requirements 9.2, 9.4, 9.7, 9.8

### Task 7: Tool_Executor

- [ ] 7.1 Implement Operation_File execution
  - Execute each Tool_Call as one Operation_File call
    `operations/<plugin>/<method>/call` in the Bound_Identity's mounted
    namespace, plugin and method from the Tool_Registry entry.
  - Send no Operation_File call through another transport, identity, mount,
    or database after a Denial, error, or Unknown_Outcome.
  - _Requirements: 8.1, 8.7, 8.14_

- [ ] 7.2 Implement receipt read-back
  - When the Tool_Executor receives a Receipt, read back the
    Authoritative_State through the granted Read_Method.
  - If the granted read method is not named in config, keep the Receipt,
    mark Authoritative_State as unverified, and send no repetition.
  - _Requirements: 8.5, 8.12_

- [ ] 7.3 Implement timeout and Unknown_Outcome handling
  - No Receipt within 30 seconds:
    - Read_Method: repeat with byte-identical input, at most 3 repetitions
      with 30-second limit each, at most one in flight.
    - Mutation_Method: no repetition, create a Blocker_Record.
  - Report unknown to the model; operator is told to check the
    Authoritative_State before asking again.
  - _Requirements: 8.6_

- [ ] 7.4 Implement pre-call validation chain
  - Apply the Offered_Tool check, the Schema_Validator check, and the
    Confirmation_Gate for mutation methods before sending any Operation_File
    call.
  - Reject Tool_Calls naming absent or Unavailable_Tools.
  - _Requirements: 8.2, 8.3, 8.4, 8.10_

- [ ] 7.5 Write property tests for tool execution
  - Property 2: Repeated read retries are idempotent.
  - Property 25: Mutation retries are rejected.
  - Validates: Requirements 8.1, 8.6, 8.14

### Task 8: Chat_Route turn loop

- [ ] 8.1 Implement the turn loop with the AI SDK
  - One operator message starts one turn. The turn loop runs model steps
    until the model stops calling tools, the Session_Mode tool-call limit
    is reached, or an error ends the turn.
  - Each structured tool-call part increments the turn counter before any
    check runs. When the counter exceeds the limit, the loop dispatches
    nothing more and streams a `limit-reached` status.
  - A pending Mutation_Method call keeps the turn stream open until
    approved, rejected, or expired (at most 300 s). The decision arrives
    on the separate decision request and the loop resumes.
  - If the client closes the turn stream, the confirmation gate discards
    that turn's pending calls.
  - _Requirements: 15.1, 15.2, 15.3_

- [ ] 8.2 Implement the Model_Context_Builder
  - Build each context from: the system prompt, the Offered_Tool definitions
    of the current Tool_Registry, the Public_Identity_Fields of the
    Bound_Identity, and the operator messages and tool results of the
    session, with Credential_Material excluded.
  - Include the model provider request through the threetched binary.
  - _Requirements: 13.2, 13.5_

- [ ] 8.3 Implement the Chat_Link stream
  - Stream tool-call status updates, model output text deltas, and
    structured events to the Chat_UI over the gRPC-Web Chat_Link.
  - The Chat_Link is a unary call (start) and a server stream (turn
    execution, tool results, status updates).
  - _Requirements: 15.1, 15.2, 9.1_

### Task 9: Chat_Link transport (gRPC-Web)

- [ ] 9.1 Define the Chat_Link protobuf contract
  - `ChatLink` service: unary `startSession`, server stream `executeTurn`.
  - Messages: `StartSessionRequest { identity_profile, session_mode,
    tool_calls_per_turn }`, `TurnRequest { operator_message }`,
    `TurnResponse { text_delta, tool_call_part, status_update, error }`.
  - `executeTurn` is a server stream returning the full turn.
  - _Requirements: 9.3, 12.8, 12.9_

- [ ] 9.2 Implement the gRPC-Web client binding
  - Use the AI SDK Chat component with a custom `ChatTransport` adapter
    over gRPC-Web.
  - The browser connects to the Chat_Route over gRPC-Web at the existing
    Door_8090 ingress (or a defined Chat_Endpoint once the owner confirms
    it).
  - The chat link adds no new listening port on the server side; it reuses
    existing Door_8090 ingress.
  - _Requirements: 9.1, 9.2, 9.3, 12.8, 12.9_

- [ ] 9.3 Write property test for transport round trip
  - Validates: Requirements 9.1, 9.2

### Task 10: Chat_UI (SvelteKit, Svelte 5, json-render)

- [ ] 10.1 Create the Chat_UI component
  - SvelteKit app with `@ai-sdk/svelte` `Chat` component.
  - Custom gRPC-Web `ChatTransport` adapter for the Chat_Link.
  - Status display: model output (separate element), Tool_Call status,
    Receipts, Authoritative_State, and error states.
  - Confirmation controls: approve and reject buttons for pending mutation
    calls.
  - Render only Catalog-declared elements. Refuse Render_Specs with
    unknown element types.
  - _Requirements: 12.1, 12.2, 12.3, 12.5, 15.3, 15.5_

- [ ] 10.2 Implement the Feed_Consumer
  - Plugin state updates delivered through Chat_Link frames.
  - Feed_Consumer displays updates in a Catalog element.
  - The Chat_UI never opens EMQX, MQTT, or direct connections.
  - Catalog_Hint is the only feed signal for re-reads; re-reads use the
    mount, not the hint.
  - _Requirements: 13.1, 13.4, 13.5_

- [ ] 10.3 Implement the Chain_Verifier display
  - Display Execution_Records in order with `prev_hash`, `exec_hash`,
    linked Tool_Call, and per-link result.
  - Report verified, broken, or unverified.
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.6, 11.7_

### Task 11: Chain verifier

- [ ] 11.1 Implement `chain/chain-verifier.ts`
  - When a Tool_Call produces a Receipt, link it to the Execution_Record
    whose identifier equals the execution identifier.
  - On re-verification request or when a Receipt is linked, re-read the
    read segment and report verified only if every Receipt-producing
    Tool_Call is linked, continuity is not broken, and no
    `verify_integrity` or recomputation result marks a record broken.
  - Report broken for any `prev_hash` mismatch. Report unverified for
    missing read operations.
  - Run in the Chat_Route server process. Input only from Operation_File
    calls in the Bound_Identity namespace.
  - Label chat-side history as non-authoritative display cache.
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.9, 11.10, 11.11_

- [ ] 11.2 Write property test for chain continuity
  - Validates: Requirements 11.3, 11.8

### Task 12: Plugin feeds over the chat link

- [ ] 12.1 Implement the Feed_Reader in the Chat_Route
  - Read the Bound_Identity's mounted views for plugin list, schema,
    state, and Held_Capability_Set.
  - Gate feeds by capability. A content-free Catalog_Hint triggers a
    catalog-pin re-read (mount-based, not hint-based).
  - _Requirements: 13.1, 13.4, 13.5_

- [ ] 12.2 Implement the Feed_Credential_Check
  - Run in the Chat_Route before any feed byte reaches the Chat_UI.
  - Each frame carries SHM_Generation and catalog hash. A catalog change
    causes a re-derive of the Tool_Registry and discard of pending calls.
  - _Requirements: 13.1, 13.4, 13.5_

### Task 13: Legacy chat cutover

- [ ] 13.1 Retire the Host_Dashboard chat path
  - The host Chat_Route (2026-11-09 VPS placement) is retired.
  - A listener on host port 8080 does not pass the gate.
  - No fallback from a missing container to port 8080.
  - _Requirements: 14.1, 14.2, 14.3_

- [ ] 13.2 Verify the container chat passes the gate
  - The running caller that must pass the gate is in the container.
  - A leftover host chat process is not a pass.
  - Source ownership stays `/srv/git/3tched.com`.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

### Task 14: End-to-end checks

- [ ] 14.1 Verify the chat boundary
  - The caller that passes the gate is inside the container.
  - A host caller and a host :8080 listener do not pass.
  - Model selection goes to the threetched binary.
  - The gate stays a call into 3tched.
  - _Requirements: 12.1, 12.4, 13.1, 13.5_

- [ ] 14.2 Run repository checks
  - Report every Chat_UI visible element lacking a Catalog declaration or
    Component_Registry implementation.
  - Report every Pinned_Package_Set entry whose version differs between
    design.md, the package manifest, and the lockfile.
  - Report every manifest specifier that is not an exact version.
  - Verify the repository check covers no Credential_Material.

- [ ] 14.3 Confirm the identity-chat retirement
  - Once the container chat is verified to run and pass the gate, the
    `crates/op-chat-interface` source and `.kiro/specs/identity-chat-interface/`
    in `/srv/git/odbus-verified` are retired.
  - _Requirements: 14.1, 14.3_
