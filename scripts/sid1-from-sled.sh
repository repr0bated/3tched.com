#!/usr/bin/env bash
# Operator helper, host-local only: print a locally registered human's SID1 in
# the standard-base64 form the connect gate expects.
#
# Reads the root-owned identity sled (sudo). Usage:
#   scripts/sid1-from-sled.sh [session-id-or-role]   # default: the human sled
# Never commit or log the output; paste it into the gate and close the shell.
set -euo pipefail

sled_file="${OPDBUS_IDENTITY_SLED:-/dev/shm/opdbus/credentials/identity_sled.json}"
selector="${1:-}"

sudo -n python3 - "$sled_file" "$selector" <<'PY'
import base64, json, sys
sleds = json.load(open(sys.argv[1]))["sleds"]
want = sys.argv[2]
def role(s): return (s.get("instance") or {}).get("config", {}).get("user.opdbus.role", "")
if want:
    match = [s for s in sleds if s["session_id"] == want or role(s) == want]
else:
    match = [s for s in sleds if s.get("principal_kind") == "human"]
if len(match) != 1:
    sys.exit(f"expected exactly one matching sled, found {len(match)}")
inline = match[0].get("sealed_id") or ""
if not inline.startswith("sid1:"):
    sys.exit("sled has no inline SID1")
raw = base64.urlsafe_b64decode(inline[5:] + "=" * (-len(inline[5:]) % 4))
print(base64.b64encode(raw).decode())
PY
