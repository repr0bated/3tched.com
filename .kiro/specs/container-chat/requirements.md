# Requirements — Container chat

> Base status, 2026-11-11. This spec supersedes `.kiro/specs/identity-chat-interface/`
> as the chat specification. It lives in `/srv/git/3tched.com` and defines chat as
> the container's sole responsibility. The identity-chat-interface spec and
> `crates/op-chat-interface` in `/srv/git/odbus-verified` are retained until this
> spec is deployed and the source is confirmed in place.
>
> Status: draft. This spec authorizes no file move, no container start, no build,
> and no deploy.

Spec id: `container-chat`
Spec home: `/srv/git/3tched.com/.kiro/specs/container-chat/`

Chat runs inside the container. The identity is the container. A host chat
process never passes the gate. The container calls 3tched (odbus-verified) for
the gate, memory, the cognitive layer, and 3tchedFS. The container calls the
threetched binary for models, providers, and skills.

Vocabulary:

- **Container repo** — `/srv/git/3tched.com`. Chat source, the range of services,
  and the threetched install. This spec.
- **threetched** — upstream ZeroClaw binary, renamed, no patches. Models,
  providers, skills. Binary-backed. Not 3tched.
- **3tched** — our code in `/srv/git/odbus-verified`. The base this repo
  installs on. Owns the gate, persistent memory, the cognitive layer, and
  3tchedFS.
- **Gate** — grants and capabilities, evaluated by 3tched. The identity is the
  container. Host callers do not pass.
- **Bound_Identity** — the sealed identity whose mounted 3tchedFS namespace
  the Chat_Interface runs under.
- **Pass-through render** — the container passes the UI spec as the container
  identity. The end user's browser renders it.

## Requirement 1: The container owns chat

**User Story:** As an operator, I want chat to run only inside the container,
so that a host process cannot impersonate the container identity.

### Acceptance Criteria

1. THE Chat_Interface SHALL reside in `/srv/git/3tched.com`.
2. THE Chat_Interface SHALL run only inside the container. A host process
   does not satisfy this requirement.
3. WHEN chat starts THEN the container SHALL be the Bound_Identity. No other
   identity is accepted.
4. IF the container is absent THEN chat SHALL fail closed. It SHALL NOT fall
   back to a host chat process or to port 8080.
5. THE Container_repo SHALL own the whole chat service range — the browser
   interface, the Chat_Route server, the turn loop, and all supporting
   modules — not only a frontend.

## Requirement 2: Identity binding through 3tchedFS

**User Story:** As the Bound_Identity, I want my chat session bound to the
sealed identity that owns my 3tchedFS mount, so that I act only as me.

### Acceptance Criteria

1. WHEN a Chat_Session starts THEN the Chat_Route SHALL obtain the
   Bound_Identity_Record by calling `identity_sled.get_own_identity` through
   the Tool_Executor as one Operation_File call in the mounted namespace, and
   SHALL send no Model_Provider request or offer any Offered_Tool until a
   Receipt is received.
2. THE Chat_Route SHALL take the Bound_Identity only from the
   `identity_sled.get_own_identity` Receipt of the mount it runs under, and
   SHALL ignore every identity, session, principal, or credential value
   supplied by the Chat_UI, the model, a tool result, the Identity_Profile,
   or a request parameter.
3. WHILE a Chat_Session is active THEN the Tool_Executor SHALL execute every
   Tool_Call as an Operation_File call in the mounted namespace of the
   Bound_Identity, and the Chat_Route SHALL keep that identity unchanged.
4. IF a session id, principal id, or display name from the Chat_UI does not
   exactly equal the corresponding value in the Bound_Identity_Record THEN
   the Chat_Route SHALL refuse to start the session, send no Model_Provider
   request, and return an identity mismatch error to the Chat_UI.
5. IF an `identity_sled.get_own_identity` result obtained after start differs
   in any field from the Bound_Identity_Record, returns a Denial, or produces
   no Receipt within 30 seconds THEN the Chat_Route SHALL end the session,
   send no further Model_Provider request, discard every pending Tool_Call,
   and record a Blocker_Record with Credential_Material excluded.
6. THE Chat_Route SHALL send only the Public_Identity_Fields to the Chat_UI.
7. THE Chat_Interface SHALL perform every `identity_sled` session write
   (`record_session_event`, `touch_session`, `refresh_credential`) only
   through the Tool_Executor, targeting the Bound_Identity's session, under
   the same Required_Capability, Schema_Validator, and Confirmation_Gate
   rules as any other Tool_Call.
8. THE Chat_Interface SHALL contain no code path that changes an identity,
   session, grant, or credential of any identity other than the Bound_Identity.
9. IF a Mutation_Method Tool_Call argument names an identity, session,
   principal, or credential other than the Bound_Identity THEN the
   Tool_Executor SHALL refuse the call, make no Operation_File call, return
   an error, and record a Blocker_Record with Credential_Material excluded.

## Requirement 3: Credential handling

**User Story:** As the owner, I want all credential material kept out of the
model, logs, rendered output, and browser storage.

### Acceptance Criteria

1. THE Model_Context_Builder SHALL exclude Credential_Material from every
   Model_Context, including operator messages and tool results.
2. THE Chat_Interface SHALL exclude Credential_Material from every log line,
   error message, rendered element, Chat_Route response, or stream chunk sent
   to the Chat_UI, and every persisted server-side Chat_Session record.
3. THE Chat_UI SHALL hold SID1 or OIA1 bytes only in the form, location, and
   lifetime that the Door_8090 transport requires.
4. THE Chat_UI SHALL persist no Credential_Material to localStorage,
   sessionStorage, IndexedDB, cookies, URLs, or the service worker cache.
5. THE Secret_Guard SHALL classify an output as containing Credential_Material
   when the item contains, in raw form or in any encoding, a complete value
   or a contiguous substring of 16 or more bytes of such a value, or a SID1
   or OIA1 envelope, including a value split across consecutive stream chunks.
6. WHEN the Secret_Guard detects Credential_Material in any outbound output
   THEN it SHALL block the whole output item on the server before any byte
   leaves the Chat_Route, keep pending Tool_Calls unchanged, replace the
   blocked item with an error, and record a security event naming the output
   channel, the Credential_Material class, the Chat_Session, and the
   Bound_Identity display name, with no part of the detected value.
7. IF the Secret_Guard returns an error or no result within the time limit
   THEN the Chat_Route SHALL withhold that output, return an error to the
   Chat_UI, and keep pending Tool_Calls unchanged.
8. IF a request from the Chat_UI contains Credential_Material in a chat
   message, Tool_Call argument, or Confirmation_Event payload, outside the
   Door_8090 transport authentication, THEN the Chat_Route SHALL reject the
   whole request before it reaches the Model_Context_Builder, Tool_Executor,
   or any log line, and record a security event.
9. THE Hackathon_Repository SHALL contain no Credential_Material.
10. THE Tool_Executor SHALL use the kernel-bound caller identity of the mount
    the Chat_Interface runs under and SHALL pass no SID1 file and no
    `--lungs-session` value.
11. FOR a message stream, the Secret_Guard SHALL check each chunk together
    with the bytes it holds back from preceding chunks, hold back only the
    trailing bytes that could begin a Credential_Material value continuing
    into the next chunk, release the checked remainder, and at stream end
    check and release or block the held-back bytes as one final item.

## Requirement 4: Tool-call through 3tchedFS

**User Story:** As the operator of the Bound_Identity, I want every tool call
to map to exactly one validated operation-file call in my mount.

### Acceptance Criteria

1. THE Tool_Executor SHALL execute each Tool_Call as exactly one
   Operation_File call `operations/<plugin>/<method>/call` in the
   Bound_Identity's mounted namespace, with the plugin and method taken from
   the Tool_Registry entry, and SHALL send no other Operation_File call for
   that Tool_Call except the identity re-check and the read-back.
2. WHEN the Chat_Route receives a Tool_Call from the Model_Provider response
   THEN it SHALL apply the Offered_Tool check, the Schema_Validator check,
   and the Confirmation_Gate before the Tool_Executor sends any call.
3. IF a Tool_Call argument fails validation THEN the Schema_Validator SHALL
   reject the call, the Model_Context_Builder SHALL return the error to the
   model, the Confirmation_Gate SHALL hold nothing, and the Tool_Executor
   SHALL send no Operation_File call.
4. IF a Tool_Call names a tool that is absent from the Chat_Session's
   Tool_Registry THEN the Tool_Executor SHALL reject the call, the
   Model_Context_Builder SHALL return a "not offered" result, and the
   Tool_Executor SHALL send no Operation_File call.
5. WHEN the Tool_Executor receives a Receipt THEN it SHALL read back the
   Authoritative_State through the granted Read_Method.
6. IF the Tool_Executor receives no Receipt within 30 seconds AFTER sending
   an Operation_File call, or the connection closes before a Receipt arrives
   THEN:
   - FOR a Read_Method, the Tool_Executor SHALL reconcile by repeating the
     same call with byte-identical input, keeping at most one repetition
     in flight and making at most 3 repetitions with the same 30-second
     limit each; if the third repetition gets no Receipt, no further call
     is sent.
   - FOR a Mutation_Method, no repetition is sent (an effect may have
     occurred), and a Blocker_Record is created.
   In both cases, the model is reported unknown and the operator is told
   to check the Authoritative_State before asking again.
7. THE Tool_Executor SHALL send no Operation_File call through another
   transport, identity, mount, or database after a Denial, error, or
   Unknown_Outcome.
8. FOR ALL argument values outside the argument schema of a Sealed_Method_Schema
   the Schema_Validator SHALL reject the value.
9. FOR ALL argument values accepted by the Schema_Validator, the
   Operation_File input SHALL decode to a value equal to the accepted
   argument value (round-trip property).

## Requirement 5: Mutation confirmation

**User Story:** As the operator, I want every state-changing tool call to
wait for my explicit approval.

### Acceptance Criteria

1. WHEN the Schema_Validator accepts a Tool_Call that names a Mutation_Method
   THEN the Confirmation_Gate SHALL hold the call as pending with the
   validated input and the computed digest, and the Chat_UI SHALL display
   the plugin, method, validated arguments, Required_Capability, and
   Bound_Identity display name with an approve control and a reject control.
2. THE Tool_Executor SHALL execute a Mutation_Method Tool_Call only after
   the Confirmation_Gate has accepted a Confirmation_Event naming the pending
   call, attributed to the same Chat_Session and Bound_Identity, with a
   digest matching the held digest. Any value supplied by the Chat_UI client
   serves only for comparison and never becomes the Operation_File input.
3. THE Confirmation_Gate SHALL accept as a Confirmation_Event only a request
   from the approve control received separately from the message stream.
   Model output, Tool_Call arguments, tool results, and typed text do not
   confirm.
4. THE Confirmation_Gate SHALL atomically consume each Confirmation_Event
   for at most one call and each pending call for at most one event.
5. WHEN the Chat_Route receives a reject request for a pending call THEN
   the Confirmation_Gate SHALL discard it, the Tool_Executor SHALL send no
   Operation_File call, and the model is reported the rejection as a tool
   result.
6. IF a confirmation request names no pending call, names an already
   consumed, rejected, expired, or discarded call, is attributed to a
   different session or identity, or carries a mismatched digest THEN the
   Confirmation_Gate SHALL refuse it.
7. IF a pending call receives neither an accepted Confirmation_Event nor a
   reject within 300 seconds THEN the Confirmation_Gate SHALL discard it.
8. IF the Chat_Route restarts or the session ends while a call is pending
   THEN the Confirmation_Gate SHALL discard it.
9. THE Tool_Executor SHALL execute no Mutation_Method without a prior
   Confirmation_Event accepted by the Confirmation_Gate.

## Requirement 6: Execution tracker linkage

**User Story:** As a verifier, I want every chat tool call linked to its
execution tracker record so the session chain is verifiable.

### Acceptance Criteria

1. WHEN a Tool_Call produces a Receipt THEN the Chat_Route SHALL link it to
   the Execution_Record whose identifier equals the execution identifier
   carried by that Receipt.
2. WHEN the Chain_Verifier completes a verification run THEN the Chat_UI
   SHALL display Execution_Records in order, each with its `prev_hash`,
   `exec_hash`, linked Tool_Call if any, and per-link result.
3. IF any `prev_hash` differs from the preceding record's `exec_hash` THEN
   the Chain_Verifier SHALL report broken, name the first differing record,
   and report the Chat_Session as broken.
4. WHERE the existing `verify_integrity` result is exposed through a granted
   operation THEN the Chain_Verifier SHALL display each record's
   `verify_integrity` result and report broken for any record whose result
   is false.
5. THE Chat_Interface SHALL treat Receipts and Execution_Records as the audit
   source of truth, SHALL label every chat-side history entry as a
   non-authoritative display cache, and SHALL never pass display cache
   entries to the Chain_Verifier.
6. IF no granted operation exposes Execution_Records or the read operation
   returns a Denial THEN the Chain_Verifier SHALL report unverified, issue
   no read through another transport, and a Blocker_Record SHALL be created.
7. THE Chain_Verifier SHALL run in the Chat_Route server process and SHALL
   accept as input only Execution_Records read through Operation_File calls
   in the Chat_Session's Bound_Identity namespace.

## Requirement 7: Committed state as display authority

**User Story:** As an operator, I want displayed operation state to come from
committed op-dbus state, not streamed model text.

### Acceptance Criteria

1. WHEN the Tool_Executor holds both the Receipt and the Authoritative_State
   read-back THEN the Chat_Route SHALL set the Tool_Call status to completed
   and stream that status, the Receipt, and the Authoritative_State to the
   Chat_UI in one update.
2. WHILE a Tool_Call lacks a Receipt and holds no terminal status THEN:
   awaiting confirmation while the Confirmation_Gate holds it,
   pending from the start of the Operation_File call, unknown from the
   Unknown_Outcome until a Receipt arrives.
3. THE Chat_UI SHALL display model-generated text in a Catalog element
   labelled as model output, distinct from the Catalog element that
   displays Tool_Call status, Receipts, and Authoritative_State, and SHALL
   display for each Tool_Call only the most recent status streamed by the
   Chat_Route, deriving no status in the browser.
4. IF model-generated text claims an operation result that differs from the
   Receipt or Authoritative_State THEN the Chat_Route SHALL leave the
   Tool_Call status unchanged and the Chat_UI SHALL display the
   Chat_Route-streamed status.
5. THE Chat_Route SHALL assign each Tool_Call exactly one status: awaiting
   confirmation, pending, unknown, unconfirmed, completed, rejected, denied,
   or failed, with completed, rejected, denied, and failed treated as
   terminal.

## Requirement 8: Model and provider selection

**User Story:** As the owner, I want the model provider choice and its
credential handling recorded and enforced.

### Acceptance Criteria

1. THE Chat_Route SHALL select the model through the threetched binary, not
   through 3tched. Model selection is a threetched responsibility.
2. THE Model_Context_Builder SHALL build each context only from: the system
   prompt, the Offered_Tool definitions of the current Tool_Registry, the
   Public_Identity_Fields of the Chat_Session's Bound_Identity, and the
   operator messages and tool results of that session, with
   Credential_Material excluded.
3. WHEN the Chat_Route sends a Model_Provider request THEN it SHALL use the
   model identifier and version selected by the threetched binary, over the
   recorded egress path, only after the Secret_Guard has checked the
   Model_Context, and SHALL use no other model as a fallback.
4. THE Chat_Route SHALL read the Provider_Credential only on the server side
   and SHALL include it in no response, message stream, tool result,
   Render_Spec, or error sent to the Chat_UI.

## Requirement 9: Transport and route placement

**User Story:** As an operator, I want chat reachable only through existing
doors, adding no new network surface.

### Acceptance Criteria

1. THE Chat_Interface SHALL add no new listening port or inbound network door
   on any deployment target. The set of listening sockets while the
   Chat_Interface runs is identical to the set while it is not running.
2. THE Chat_Interface reaches the 3tched base only through the Lungs_Socket.
   It SHALL NOT connect to Door_8090, the Op_Web_Connector, or any other
   host address or socket.
3. THE Chat_UI sends every request to the Chat_Route through the Chat_Link
   endpoint. It sends no request to any other backend origin.
4. IF no existing path satisfies criteria 1, 2, and 3 using only pre-existing
   components THEN a Blocker_Record SHALL be created and dependent tasks
   remain in proposed status.

## Requirement 10: Rendering passes through the container

**User Story:** As an end user, I want my browser to render the UI spec,
so the host does not draw the page and the container does not run a desktop.

### Acceptance Criteria

1. WHEN a page is shown THEN the container SHALL pass the spec as the
   container identity, and the end user's browser SHALL render it.
2. WHEN the spec is passed THEN the pass SHALL be as the container identity.
3. THE container SHALL NOT run a desktop, a Wayland compositor, or wayvnc
   for this path.
4. IF the delivery mechanism is undecided THEN the spec SHALL still pass
   through the container. IPFS, a gated browser, and a local renderer
   remain open. None is a decision.
5. THE network SHALL NOT draw the UI, and the container SHALL have no IP
   that the user types.

## Requirement 11: Denial handling

**User Story:** As an operator, I want the chat to reflect and use existing
grants only, never widening what the Bound_Identity is allowed.

### Acceptance Criteria

1. THE Chat_Interface SHALL contain no code path that writes, materializes,
   broadens, or overrides capability grants.
2. WHEN the Tool_Executor's Operation_File call returns a Denial THEN the
   Chat_Route SHALL create a Blocker_Record on the server before sending
   the result to the Chat_UI, containing the plugin, method, the
   Bound_Identity principal id as caller, the missing Required_Capability
   or policy, and the error text.
3. WHEN a Tool_Call receives a Denial THEN the Tool_Executor SHALL end that
   call, send no further Operation_File call, and make no attempt through
   another Operation_File, transport, identity, or database.
4. WHEN an Offered_Tool receives a Denial THEN the Tool_Registry SHALL mark
   it as Unavailable_Tool for the rest of the session, even after a
   re-derivation, and the Confirmation_Gate SHALL discard every pending
   call naming that tool.
5. THE Model_Context_Builder SHALL add a denial to the Model_Context only
   as the tool result of that call, containing a denial indication, the
   plugin, method, missing capability, and redacted error text.
6. AFTER the first Denial for a tool, the Tool_Executor SHALL send zero
   further Operation_File calls for that tool's plugin and method in that
   session.
7. IF the Chat_Route receives a request to run, retry, or confirm a
   previously-denied Tool_Call THEN it SHALL reject the request.

## Requirement 12: Svelte-based browser interface

**User Story:** As an operator, I want a chat interface that follows the UI
stack rule and stays separable from the existing production UI.

### Acceptance Criteria

1. THE Chat_UI SHALL be implemented with SvelteKit, Svelte 5, Vite, and the
   json-render Svelte renderer.
2. THE Chat_Interface source SHALL contain no React, JSX, TSX, or Next.js
   dependency, file, or import.
3. THE Chat_UI SHALL render only Render_Specs whose every element type is
   declared in the Catalog and implemented in the Component_Registry.
4. IF a Render_Spec contains an element type absent from the Catalog or the
   Component_Registry THEN the Chat_UI SHALL refuse the whole spec and
   display a Catalog error naming the element type.
5. THE Chat_Interface SHALL write only the Chat_UI and the Canvas in
   TypeScript/Svelte, and every other component as Rust crates, including
   the Chat_Route server and every op-dbus change.

## Requirement 13: Shared surfaces at install and runtime

**User Story:** As an operator, I want install ownership and runtime calls
written down so a later edit does not merge the three repos.

### Acceptance Criteria

1. WHEN the container repo is installed THEN chat and the threetched binary
   SHALL be that install's payload on top of base 3tched.
2. WHEN chat runs THEN it SHALL call 3tched for the gate, memory, the
   cognitive layer, and 3tchedFS.
3. WHEN chat selects a model, provider, or skill THEN it SHALL call the
   threetched binary.
4. WHEN chat uses lungs THEN it SHALL connect to the one 3tched socket and
   SHALL NOT bind its own listener.
5. THE network SHALL remain the proof transport to `10.0.0.2:8090` and
   SHALL NOT gain chat, the binary, or the gate.
6. 3tched SHALL NOT absorb chat source from `/srv/git/3tched.com`.
7. 3tched SHALL NOT vendor or patch the threetched binary.
8. 3tched SHALL NOT take the network bridge or WireGuard.

## Requirement 14: Legacy chat removal

**User Story:** As an operator, I want the old host chat route removed once
the container chat is verified.

### Acceptance Criteria

1. WHEN the container chat is verified to run and pass the gate THEN the
   host Chat_Route and its 2026-11-09 VPS placement SHALL be retired.
2. A listener on host port 8080 SHALL NOT pass the gate.
3. THE Chat_Interface SHALL not start until the legacy route is retired or
   confirmed as not passing the gate.

## Requirement 15: Plugin feeds over the chat link

**User Story:** As an operator, I want plugin state updates delivered through
the chat link, not through a separate broker.

### Acceptance Criteria

1. THE Chat_Route SHALL read the Bound_Identity's mounted views to build the
   Tool_Registry and feed the Chat_Link.
2. THE Feed_Credential_Check SHALL run in the Chat_Route before any feed
   byte is written to a Chat_Link frame.
3. THE Chat_UI SHALL never open an EMQX, MQTT, or direct connection.
4. A content-free Catalog_Hint is the only feed signal that can cause a
   catalog-pin re-read, and that re-read SHALL use the mount, not the hint.
5. THE network SHALL NOT deliver plugin feeds.
