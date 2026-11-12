#!/usr/bin/env bash
# =============================================================================
# OP-DBUS Host Fabric Startup Script
# Supervised by runit: /etc/sv/ovsbr0-network/run
# Host OS: Devuan GNU/Linux (runit, D-Bus Control) (Init: runit, Pkg: apt)
#
# This script does not touch ovsbr0. Bridge ensure, uplink, pub0, svc0, tun5,
# and op-grpc-bridge live in host-bridge-after-deploy.sh and run after deploy.
# =============================================================================
set -euo pipefail

readonly LUNGS_SOCK="/run/opdbus/lungs/lungs.sock"
readonly EGRESS_SOCK="/run/opdbus-egress/http.sock"

log() {
  printf "[opdbus-host-boot] %s\n" "$*"
}

# Socket directories for Lungs and the egress proxy. The bridge is not required.
log "Preparing UNIX domain socket directories for Lungs and egress proxy..."
install -d -m 0750 -o root -g opdbus "$(dirname "${LUNGS_SOCK}")"
install -d -m 0750 -o root -g opdbus "$(dirname "${EGRESS_SOCK}")"
log "Socket directories ready. Run host-bridge-after-deploy.sh after the bridge is deployed."
