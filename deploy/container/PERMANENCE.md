# 3tchedChatbot permanence map

3tchedChatbot is the always-running Control Plane chatbot. This page records
what it depends on, what survives a host reboot, and where it can silently
stop. Observed on the live host 2026-11-12; items marked **gap** are not yet
handled.

## Boot chain (host, runit)

```
kernel rootflags=subvol=@trial
 └─ runit
     ├─ lxcfs
     ├─ incus            (sv start lxcfs; incusd)
     │   └─ 3tched-pool  btrfs loop of /var/lib/incus/disks/3tched-pool.img (150 GiB)
     ├─ 3tched-container-root   (waits for pool, then:)
     │   ├─ mount /run/mounts/upgrade-3tched      sda5 @ ro
     │   ├─ mount .../3tchedChatbot/mnt/rocksdb   cozo_rocksdb.img ext4 (fstab line)
     │   ├─ container-root.sh mount|verify        sda4 seed + cozo_delta.img sprout, subvol @root
     │   ├─ incus start 3tchedChatbot
     │   └─ sleep infinity
     ├─ ct-egress        Xray client -> /run/opdbus-egress/http.sock -> decoy:9443
     └─ network-uplink   heal loop every 30 s
```

## Dependencies and their lifetime

| Dependency | Where | Survives reboot | Owner |
|---|---|---|---|
| Root OS | sda4 sealed seed (Ubuntu 26.04.1) + sprout `@root` in `cozo_delta.img` | yes | seed is immutable; sprout holds all guest changes |
| Upgrade lower | sda5 `@`, ro | yes | fstab + run script |
| Incus pool image | `/var/lib/incus/disks/3tched-pool.img` on host subvolume **`@trial`** | only while the host boots `@trial` | host |
| Cozo / sled / snowball / chat-history | `cozo_rocksdb.img` ext4 at `/var/lib/rocksdb` | yes | fstab line |
| Identity sled | `subvolumes/user` at `/agent/user`; `sealed_id` ro bind | yes | minted by the container door |
| NextDNS context | sealed into `sealed_id` at minting from `OP_IDENTITY_NEXTDNS_BINDINGS` (profile `689ec7`) | yes, once minted | profile env |
| Lungs | `/run/opdbus/lungs/lungs.sock`, host tmpfs, same path in guest | **no**: directory and socket are recreated each boot | socket bound by the container door |
| Egress | `/run/opdbus-egress/http.sock`, host tmpfs | recreated by `ct-egress` | host Xray client |
| Egress upstream | decoy `129.80.64.127`, `xray-egress` on 9443, then WARP | remote | VPS |
| SHM catalog | `/dev/shm/opdbus/plugin-blobs` in the guest | **no** (tmpfs) | not yet identified |
| Boot scripts | `/srv/git/3tched.com/deploy/container/*` (working tree on `@git`) | yes | git checkout |

## Gaps

1. **Pool on `@trial`.** The host boots `rootflags=subvol=@trial`; the pool
   image and Incus state live inside it. Booting `@rootfs`, `@release-a` or
   `@release-b` would start without this container. `@incus` exists but is not
   mounted.
2. **Boot runs from a git working tree.** `3tched-container-root` executes
   `container-root.sh` from `/srv/git/3tched.com`. A branch switch or edit
   changes boot behaviour. An installed copy (e.g. `/usr/local/lib/3tched/`)
   would decouple them.
3. **No restart supervision.** After `incus start` the service only sleeps.
   If the container stops, nothing restarts it; `boot.autostart` is `false`.
   The run script should wait on the container and exit when it stops so runsv
   restarts it.
4. **Lungs directory not created at boot.** `host-boot-ovs.sh` is not installed
   as a service; `/run/opdbus/lungs` was created by hand and is lost on reboot.
   `3tched-container-root` should create it before `incus start`.
5. **Repeated upgrade mount.** `/run/mounts/upgrade-3tched` is mounted three
   times (fstab plus one `mount` per service restart). The run script should
   skip it when it is already a mountpoint.
6. **Door not running in the container.** `op-grpc-bridge` is present in the
   guest but has no service; it must bind lungs and mint `sealed_id`. Until
   then `3tchedfs-control` and `3tchedfs-upstream` fail every 5 s.
7. **SHM catalog source unknown.** The guest's `/dev/shm/opdbus` is empty;
   3tchedFS needs `plugin-blobs/.manifest.json` there.
8. **Egress has a remote single point.** The decoy resolver (`127.0.2.2`,
   `127.0.2.3`) refuses connections, so REALITY fails with EOF. WARP units
   `op-warp-prepare` (failed) and `op-warp-ssh` (missing) on the decoy.
9. **Seed carries desktop services.** The seed is a full Ubuntu desktop
   (snaps, cups, bluetooth, avahi, cloud-init); several fail every boot. The
   seed cannot change; masking them would live in the sprout.
