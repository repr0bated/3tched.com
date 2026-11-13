# Host egress (Xray client)

The host's only egress socket for NIC-less containers is
`/run/opdbus-egress/http.sock`, an Xray HTTP inbound with no TCP listener.
Xray on the host is a client only. Its one outbound is VLESS/REALITY (Vision)
to the exit VPS `209.74.79.180:443`, the container exit point (the German
uplink must not be the exit). The outbound comes from the old root's
`/etc/xray/reality-tun.json` (tag `reality-egress`).

| File | Installed at |
|---|---|
| `run`, `log/run` | `/etc/sv/ct-egress/` (runit, linked from `/etc/service/ct-egress`) |
| `ct_egress.nft` | `/etc/ct-egress/ct_egress.nft` (user `ct-egress` may dial only the exit VPS 209.74.79.180:443) |
| `make-client-config.sh` | writes `/etc/ct-egress/xray.json` from a root-only config holding the `reality-egress` outbound |

Xray 26.3.27 (same version as the decoy) is at `/usr/local/bin/xray`, assets in
`/usr/local/share/xray`. The guest reaches the socket through the
`opdbus-egress-socket` disk device and its `127.0.0.1:3128` forwarder.

Verified 2026-11-13 from 3tchedChatbot: Cloudflare trace `ip=209.74.79.180`,
`loc=US`; 10 MB in at 4.53 MB/s (host direct 50 MB/s). The decoy is not part of
egress; the decoy changes below were made in error and should be undone.

## Decoy changes made 2026-11-12 (record)

- `xray-egress.service` enabled (was disabled), `/etc/xray/egress-server.json` unchanged
  (backup `egress-server.json.before-show-20261112`).
- `/etc/resolv.conf`: a cloudflare-warp-generated file pointed at dead `127.0.2.2/.3`.
  Replaced by a pinned `nameserver 127.0.0.53` file, `chattr +i` (warp-svc in cf-mesh
  rewrote it otherwise); backup `/etc/resolv.conf.before-stub-20261112`.
- REALITY target (`www.cloudflarestatus.com`) is unreachable over the fail-closed
  physical egress. Last change: `/usr/local/sbin/xray-egress-cover-route` (routes the
  target's addresses via `wgcf-ingress`) as `ExecStartPre` in
  `/etc/systemd/system/xray-egress.service.d/warp-mark.conf`. The decoy stopped
  answering on all ports during that change; to undo, remove that drop-in and script,
  `systemctl daemon-reload`, and delete any `/32`/`/128` routes on `wgcf-ingress`.
