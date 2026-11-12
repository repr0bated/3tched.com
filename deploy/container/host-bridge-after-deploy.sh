#!/usr/bin/env bash
# =============================================================================
# OP-DBUS host bridge attach — run after the bridge authority is deployed.
# Authority: org.opdbus.v1.Rovs (Direct ovs-vsctl commands FORBIDDEN)
# Stay in the foreground. runsv restarts this process when it exits.
# =============================================================================
set -euo pipefail

readonly DBUS_DEST="org.opdbus.v1.Rovs"
readonly DBUS_OBJ="/org/opdbus/v1/Rovs"
readonly BRIDGE="ovsbr0"
readonly UPLINK="eth0"
readonly PUB_PORT="pub0"
readonly SVC_PORT="svc0"
readonly SVC_CIDR="10.0.0.2/24"
readonly SVC_IP="10.0.0.2"
readonly TONIC_PORT="8090"
readonly DECOY_TUN="tun5"
readonly LUNGS_SOCK="/run/opdbus/lungs.sock"
readonly EGRESS_SOCK="/run/opdbus-egress/http.sock"

log() {
  printf "[opdbus-host-bridge] %s\n" "$*"
}

# 1. Verify raw ovs-vsctl is not invoked; enforce D-Bus Rovs backend
log "Ensuring host OVS bridge '${BRIDGE}' via D-Bus authority ${DBUS_DEST}..."
gdbus call --system \
  --dest "${DBUS_DEST}" \
  --object-path "${DBUS_OBJ}" \
  --method "${DBUS_DEST}.EnsureBridge" \
  "${BRIDGE}"

# 2. Enslave physical uplink (eth0) as L2 transport without IP
log "Enslaving physical interface '${UPLINK}' into '${BRIDGE}' (zero host IP)..."
gdbus call --system \
  --dest "${DBUS_DEST}" \
  --object-path "${DBUS_OBJ}" \
  --method "${DBUS_DEST}.AttachPhysicalUplink" \
  "${BRIDGE}" "${UPLINK}" "ipv4.method=disabled"

# 3. Configure Public Gateway internal port (pub0)
log "Configuring public WAN gateway port '${PUB_PORT}' (198.51.100.42/24)..."
gdbus call --system \
  --dest "${DBUS_DEST}" \
  --object-path "${DBUS_OBJ}" \
  --method "${DBUS_DEST}.EnsureInternalPort" \
  "${BRIDGE}" "${PUB_PORT}" "198.51.100.42/24"

# 4. Configure Service Door (svc0) for Tonic gRPC Bridge
log "Binding Service Door '${SVC_PORT}' with IP ${SVC_CIDR} (Tonic door :${TONIC_PORT})..."
gdbus call --system \
  --dest "${DBUS_DEST}" \
  --object-path "${DBUS_OBJ}" \
  --method "${DBUS_DEST}.EnsureInternalPort" \
  "${BRIDGE}" "${SVC_PORT}" "${SVC_CIDR}"

# 5. Attach Cloudflare WARP / MASQUE Decoy Ingress Tunnel (tun5)
log "Attaching encrypted WARP/MASQUE decoy tunnel '${DECOY_TUN}' to '${BRIDGE}'..."
gdbus call --system \
  --dest "${DBUS_DEST}" \
  --object-path "${DBUS_OBJ}" \
  --method "${DBUS_DEST}.AttachDecoyTunnel" \
  "${BRIDGE}" "${DECOY_TUN}" "Cloudflare WARP/MASQUE"

# 6. Launch op-grpc-bridge on svc0 (${SVC_IP}:${TONIC_PORT}) and open shared lungs.sock
log "Starting op-grpc-bridge on ${SVC_IP}:${TONIC_PORT} and ${LUNGS_SOCK}..."
exec /usr/bin/op-grpc-bridge \
  --bind-tonic "${SVC_IP}:${TONIC_PORT}" \
  --lungs-sock "${LUNGS_SOCK}" \
  --egress-sock "${EGRESS_SOCK}" \
  --mutation-engine "org.opdbus.v1.MutationEngine" \
  --verify-sid1-claims
