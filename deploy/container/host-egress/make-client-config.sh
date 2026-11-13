#!/bin/sh
# Build /etc/ct-egress/xray.json (host Xray client) from a root-only REALITY
# outbound source: any Xray config whose outbounds contain tag
# "reality-egress" (the exit VPS). Secrets stay in that file and the 0640
# result; nothing is printed or stored in this repo.
#   sudo deploy/container/host-egress/make-client-config.sh <source.json>
set -eu
SRC=$1
umask 077
jq -e '.outbounds[] | select(.tag=="reality-egress")' "$SRC" >/dev/null
jq '(.outbounds[] | select(.tag=="reality-egress") | del(.streamSettings.sockopt)) as $vps | {
 log: {loglevel: "warning", access: "none"},
 inbounds: [{tag: "opdbus-egress", listen: "/run/opdbus-egress/http.sock,0666", protocol: "http", settings: {}}],
 outbounds: [$vps, {tag: "deny", protocol: "blackhole", settings: {response: {type: "http"}}}],
 routing: {domainStrategy: "AsIs", rules: [
  {type: "field", domain: ["full:localhost", "domain:localhost"], outboundTag: "deny"},
  {type: "field", ip: ["geoip:private"], outboundTag: "deny"},
  {type: "field", inboundTag: ["opdbus-egress"], outboundTag: "reality-egress"}]}
}' "$SRC" | install -D -m 0640 -o root -g ct-egress /dev/stdin /etc/ct-egress/xray.json
XRAY_LOCATION_ASSET=/usr/local/share/xray chpst -u ct-egress:ct-egress xray run -test -config /etc/ct-egress/xray.json >/dev/null
echo "wrote /etc/ct-egress/xray.json; exit $(jq -r '.outbounds[0].settings.vnext[0] | "\(.address):\(.port)"' /etc/ct-egress/xray.json)"
