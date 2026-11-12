#!/bin/sh
# Build /etc/ct-egress/xray.json (host Xray client) from the decoy's
# /etc/xray/egress-server.json. Secrets are read over SSH and written only to
# the root-owned 0640 config; nothing is printed or stored in this repo.
#   sudo deploy/container/host-egress/make-client-config.sh <ssh-key> [user@host]
set -eu
KEY=$1; DECOY=${2:-ubuntu@129.80.64.127}; ADDR=${DECOY#*@}
umask 077; T=$(mktemp)
trap 'shred -u "$T" 2>/dev/null || rm -f "$T"' EXIT
ssh -o BatchMode=yes -i "$KEY" "$DECOY" 'sudo -n sh -c '\''
c=/etc/xray/egress-server.json
pk=$(jq -r ".inbounds[0].streamSettings.realitySettings.privateKey" $c)
seed=$(jq -r ".inbounds[0].streamSettings.realitySettings.mldsa65Seed" $c)
pub=$(xray x25519 -i "$pk" | awk -F": *" "tolower(\$1) ~ /public|password/ {print \$2; exit}")
ver=$(xray mldsa65 -i "$seed" | awk -F": *" "tolower(\$1) ~ /verify/ {print \$2; exit}")
jq -c --arg pub "$pub" --arg ver "$ver" "{id: .inbounds[0].settings.clients[0].id, sni: .inbounds[0].streamSettings.realitySettings.serverNames[0], sid: .inbounds[0].streamSettings.realitySettings.shortIds[0], path: .inbounds[0].streamSettings.xhttpSettings.path, pub: \$pub, ver: \$ver}" $c
'\''' > "$T"
jq --arg addr "$ADDR" '{
 log: {loglevel: "warning", access: "none"},
 inbounds: [{tag: "opdbus-egress", listen: "/run/opdbus-egress/http.sock,0666", protocol: "http", settings: {}}],
 outbounds: [
  {tag: "decoy-reality", protocol: "vless",
   settings: {vnext: [{address: $addr, port: 9443, users: [{id: .id, encryption: "none"}]}]},
   streamSettings: {network: "xhttp", security: "reality",
     xhttpSettings: {path: .path, mode: "packet-up"},
     realitySettings: {serverName: .sni, fingerprint: "chrome", password: .pub, shortId: .sid, mldsa65Verify: .ver}},
   mux: {enabled: false}},
  {tag: "deny", protocol: "blackhole", settings: {response: {type: "http"}}}],
 routing: {domainStrategy: "AsIs", rules: [
  {type: "field", domain: ["full:localhost", "domain:localhost"], outboundTag: "deny"},
  {type: "field", ip: ["geoip:private"], outboundTag: "deny"},
  {type: "field", inboundTag: ["opdbus-egress"], outboundTag: "decoy-reality"}]}
}' "$T" | install -D -m 0640 -o root -g ct-egress /dev/stdin /etc/ct-egress/xray.json
XRAY_LOCATION_ASSET=/usr/local/share/xray chpst -u ct-egress:ct-egress xray run -test -config /etc/ct-egress/xray.json >/dev/null
echo "wrote /etc/ct-egress/xray.json"
