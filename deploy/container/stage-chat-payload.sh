#!/bin/sh
# Stage already-built chat artifacts into an OFFLINE container snapshot root.
# No compiler, service action, container start, grant edit or live install.
set -eu
[ "$#" -eq 3 ] || { echo 'usage: stage-chat-payload.sh SNAPSHOT_ROOT CHAT_ROUTE_BINARY BROWSER_DIST' >&2; exit 2; }
ROOT=$(realpath "$1")
BINARY=$(realpath "$2")
DIST=$(realpath "$3")
[ "$ROOT" != / ] && [ -d "$ROOT" ] || { echo 'offline snapshot root required' >&2; exit 1; }
[ -x "$BINARY" ] && [ -f "$BINARY" ] && [ ! -L "$BINARY" ] || { echo 'built executable required' >&2; exit 1; }
[ -f "$DIST/index.html" ] || { echo 'built browser dist required' >&2; exit 1; }
# ELF magic, not a shell placeholder or launcher.
[ "$(od -An -tx1 -N4 "$BINARY" | tr -d ' \n')" = 7f454c46 ] || { echo 'chat-route must be a built ELF executable' >&2; exit 1; }
install -d "$ROOT/usr/local/bin" "$ROOT/usr/local/share/3tched/chat"
install -m 0755 "$BINARY" "$ROOT/usr/local/bin/chat-route"
cp -R "$DIST/." "$ROOT/usr/local/share/3tched/chat/"
install -d "$ROOT/etc/op-dbus/env"
printf '%s\n' /usr/local/share/3tched/chat > "$ROOT/etc/op-dbus/env/CHAT_UI_DIR"
printf '%s\n' /run/mounts/3tchedFS > "$ROOT/etc/op-dbus/env/CHAT_UI_MOUNT"
printf '%s\n' /run/mounts/threetched > "$ROOT/etc/op-dbus/env/CHAT_UI_BINARY_MOUNT"
# Browser bytes are rendered by the user's browser. The existing container door
# owns ingress; this payload does not start another HTTP server or a desktop.
sha256sum "$ROOT/usr/local/bin/chat-route" "$ROOT/usr/local/share/3tched/chat/index.html" > "$ROOT/usr/local/share/3tched/chat/PAYLOAD.sha256"
