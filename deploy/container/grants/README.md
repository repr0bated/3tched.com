# Capability grants for chatbot containers

`capability-grants.base.json` is the durable grant document without the chatbot:
the closed groups and the human principals. `$ROOT` holds every capability the
sealed catalog declares plus those previously granted (960, listed exactly;
grant documents reject wildcards). Regenerate the `$ROOT` list after a reseal.

`control-plane-chatbot.entry.json` is the chatbot's entry: `$ROOT` membership
and no capabilities of its own. Provisioning keys it by the chatbot's derived
principal (`derive_principal_id(wireguard_pubkey)`) and writes the result to the
container's `/etc/opdbus/capability-grants.json`. Inside the container,
`op-grants-materializer run` projects it to `/dev/shm/opdbus/capability-grants.json`,
which the door reads.

The control-plane chatbot key is the decoy wg-opdbus server key. It is the one
exception that also holds a human principal (registered with alias
`control-plane-chatbot`).

Planned after development (owner, 2026-11-12): the chatbot keeps no execute
ability, only delegation, and root tasks require two humans. `$ROOT` for the
chatbot is temporary.
