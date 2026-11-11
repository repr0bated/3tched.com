# Implementation Plan — Container chat

Draft only. Do not start these tasks until the owner approves them. Do not
build, do not move files, and do not deploy from this list. Do not name an
Incus instance. Do not create a loop device or a per-container disk image.

This plan supersedes `.kiro/specs/identity-chat-interface/tasks.md`. The
identity-chat spec and `crates/op-chat-interface` stay in
`/srv/git/odbus-verified` until the owner says this spec is done. The
container owns runtime chat. Server code is Rust. The browser is the
Svelte app already in this repo. There is no second TypeScript server and
no tool registry.

Tests, fmt, and Clippy run only after deployment and only when the owner
asks. A task is not blocked on a property test.

## Tasks

- [ ] 1. Keep the spec instance-agnostic
  - No task names an Incus instance, a container name, or a disk.
  - No task uses a loop device, a loop-backed root, or a per-container image.
  - _Requirements: 1.6, 1.7_

- [ ] 2. Place the Rust Chat_Route with the container install
  - The modules are `errors`, `guard`, `profile`, `validation`, `gate`,
    `state`, `status`, `chain`, and `types`.
  - The existing binary's `10.0.0.2:50051` bind is the old host placement.
    Do not keep that bind. Do not edit the binary from this list.
  - They install on top of base 3tched. They do not become a second copy
    inside 3tched.
  - Do not create `apps/chat/` or a TypeScript Chat_Route.
  - _Requirements: 1.1, 1.5, 12.5, 13.1_

- [ ] 3. Bind the session to the mount
  - `identity_sled.get_own_identity` is one Operation_File call on the
    mount the process runs under.
  - No model call is sent until that call returns a Receipt.
  - A later mismatch ends the session.
  - _Requirements: 2_

- [ ] 4. Keep credentials out of the model and the browser
  - Secret_Guard runs in the Chat_Route.
  - A blocked item does not leave the process.
  - The browser persists no credential.
  - _Requirements: 3_

- [ ] 5. Call offered methods through the mount
  - An offered method is a plugin method on the mount whose required
    capability the identity holds.
  - One tool call is one Operation_File call.
  - Arguments that fail the sealed schema are not sent.
  - A mutation waits for a separate approve whose digest matches the held
    input. The client digest is not the input.
  - A read may be repeated at most three times. A mutation is not repeated.
  - A denial ends that plugin method for the session.
  - _Requirements: 4, 5, 11_

- [ ] 6. Show committed state, not model text
  - Completed requires a Receipt and a verified read-back.
  - The browser displays the status the Chat_Route streamed.
  - _Requirements: 7_

- [ ] 7. Select models on the threetched binary
  - 3tched does not gain a second model implementation.
  - A missing binary fails the model call.
  - _Requirements: 8, 13.3, 13.7_

- [ ] 8. Cross to 3tched only through lungs
  - One socket, `/run/opdbus/lungs/lungs.sock`.
  - No host listener, including port 8080.
  - No direct connection to `10.0.0.2:8090`.
  - The browser render path stays open. It does not become a host page.
  - _Requirements: 9, 10, 13.4, 13.5_

- [ ] 9. Verify the chain from operation-file records
  - Continuity is `prev_hash` against the previous `exec_hash`.
  - Display cache is not an input.
  - _Requirements: 6_

- [ ] 10. Read plugin state from the mount
  - No EMQX and no MQTT on the chat path.
  - A catalog hint only triggers a re-read of the mount.
  - _Requirements: 15_

- [ ] 11. Leave the host chat route in place until the owner removes it
  - Container chat does not wait for that removal.
  - A host caller is not a pass.
  - _Requirements: 14_
