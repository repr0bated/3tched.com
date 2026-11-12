#!/bin/sh
# door-tls.sh <rootfs> <name>
# Container-local TLS for the identity door: one server identity (door on
# 127.0.0.1:8090 and ExHook on 127.0.0.1:9000, both guest loopback) and a
# private CA that signs exactly one ExHook client certificate. The CA key is
# deleted after signing, so no further clients can be issued. Existing
# material is kept. Nothing leaves the container's sprout.
set -eu
ROOT=$1 NAME=$2
D="$ROOT/etc/op-dbus/tls"
[ -s "$D/door.key" ] && [ -s "$D/exhook-client.crt" ] && exit 0
install -d -m 0700 "$D"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
ossl() { openssl "$@" 2>/dev/null; }
ossl req -x509 -newkey ed25519 -nodes -days 3650 -subj "/CN=${NAME}-local-ca" \
  -addext basicConstraints=critical,CA:TRUE -keyout "$T/ca.key" -out "$D/ca.crt"
ossl req -newkey ed25519 -nodes -subj "/CN=${NAME}" -keyout "$D/door.key" -out "$T/door.csr"
printf 'subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n' > "$T/srv.ext"
ossl x509 -req -in "$T/door.csr" -CA "$D/ca.crt" -CAkey "$T/ca.key" -days 3650 \
  -extfile "$T/srv.ext" -out "$D/door.crt"
ossl req -newkey ed25519 -nodes -subj "/CN=${NAME}-exhook-client" \
  -keyout "$D/exhook-client.key" -out "$T/cli.csr"
printf 'extendedKeyUsage=clientAuth\n' > "$T/cli.ext"
ossl x509 -req -in "$T/cli.csr" -CA "$D/ca.crt" -CAkey "$T/ca.key" -days 3650 \
  -extfile "$T/cli.ext" -out "$D/exhook-client.crt"
chown 0:0 "$D"/*
chmod 0600 "$D"/*.key
chmod 0644 "$D"/*.crt
