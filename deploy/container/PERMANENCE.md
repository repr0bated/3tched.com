# 3tchedChatbot permanence map

3tchedChatbot is the always-running Control Plane chatbot. This page records
what it depends on, what survives a host reboot, and where it can silently
stop. Observed on the live host 2026-11-12; items marked **gap** are not yet
handled.

## Boot chain (host, runit)

```
kernel rootflags=subvol=@rootfs
 └─ runit
     ├─ lxcfs
     ├─ incus            (sv start lxcfs; incusd)
     │   └─ 3tched-pool  btrfs loop of /var/lib/incus/disks/3tched-pool.img (150 GiB)
     ├─ 3tched-container-root   (waits for pool, then:)
     │   ├─ mount /run/mounts/upgrade-3tched      sda5 @ ro (skipped if mounted)
     │   ├─ install -d /run/opdbus/lungs /run/opdbus-egress
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
| Incus pool image | `/var/lib/incus/disks/3tched-pool.img` on host root subvolume `@rootfs` | yes | host |
| Cozo / sled / snowball / chat-history | `cozo_rocksdb.img` ext4 at `/var/lib/rocksdb` | yes | fstab line |
| Identity sled | `subvolumes/user` at `/agent/user`; `sealed_id` ro bind | yes | minted by the container door |
| NextDNS context | sealed into `sealed_id` at minting from `OP_IDENTITY_NEXTDNS_BINDINGS` (profile `689ec7`) | yes, once minted | profile env |
| Lungs | `/run/opdbus/lungs/lungs.sock`, host tmpfs, same path in guest | directory recreated by `3tched-container-root`; socket rebound each boot | socket bound by the container door |
| Egress | `/run/opdbus-egress/http.sock`, host tmpfs | recreated by `ct-egress` | host Xray client |
| Egress upstream | decoy `129.80.64.127`, `xray-egress` on 9443, then WARP | remote | VPS |
| SHM catalog | `/dev/shm/opdbus/plugin-blobs` in the guest | **no** (tmpfs) | not yet identified |
| Boot scripts | `/srv/git/3tched.com/deploy/container/*` (working tree on `@git`) | yes | git checkout |

## Gaps

1. **Resolved 2026-11-12: root adopted as `@rootfs`.** The former `@trial`
   (ID 579) is now `@rootfs`; the old Ubuntu root (ID 256) is
   `@rootfs-ubuntu-20261013` and stays the second GRUB entry. `/etc/fstab` and
   `grub.cfg` use the new names; backups are `*.before-rootfs-20261112T1818`.
   The pool image and Incus state live inside `@rootfs`, so booting
   `@release-a`/`@release-b` still starts without this container. `@incus`
   exists but is not mounted.
2. **Boot runs from a git working tree.** `3tched-container-root` executes
   `container-root.sh` from `/srv/git/3tched.com`. A branch switch or edit
   changes boot behaviour. An installed copy (e.g. `/usr/local/lib/3tched/`)
   would decouple them.
3. **No restart supervision.** After `incus start` the service only sleeps.
   If the container stops, nothing restarts it; `boot.autostart` is `false`.
   The run script should wait on the container and exit when it stops so runsv
   restarts it.
4. **Resolved: lungs directory.** `3tched-container-root` creates
   `/run/opdbus/lungs` and `/run/opdbus-egress` before `incus start`.
5. **Resolved: repeated upgrade mount.** The run script skips the mount when
   `/run/mounts/upgrade-3tched` is already a mountpoint. The three stacked
   mounts from earlier restarts clear at the next reboot.
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

## Storage roles (owner, 2026-11-12)

- **Btrfs: OS persistence.** Shared sda4 seed plus this container's sprout
  (`cozo_delta.img`, copied from `/var/lib/incus/disks/`).
- **RocksDB: user persistence.** Incus volume `3tchedChatbot-rocksdb` at
  `/var/lib/rocksdb`: the durable store for any code that keeps user state.
  No layout is imposed; the private memory Cozo uses `cozo/`
  (`COGNITIVE_COZO_DB_PATH`).
- **Sled: mounted rw, not durable.** Snowball and its identity-cozo fork live
  on host tmpfs `/run/opdbus-sled/<container>`, bound read-write at
  `/run/opdbus-sled` (`OPDBUS_SNOWBALL_PATH`, `IDENTITY_SLED_COZO_DB_PATH`).
  The host writes it; it is mutated at vectorization and reset, and a host
  reboot clears it. Without a Btrfs sink the chain records to RAM.
- **`sealed_id` is the sled's persistence.** It lives in the `/agent/user`
  Btrfs subvolume (durable, read-only in the guest, host read-write). The
  sled resets; what must survive the reset is sealed into `sealed_id`
  (SID1 identity and the NextDNS context, sealed at minting).

**Code drift.** `odbus-verified` forked one ledger into two stores: the
identity sled Cozo (`IDENTITY_SLED_COZO_DB_PATH`) and the snowball chain
(`OPDBUS_SNOWBALL_PATH`). The deploy config keeps them apart until the code is
merged.

## Identity (2026-11-12)

The control-plane chatbot instance is `3tchedChatbot`; containers after it are
`ID-1`, `ID-2`, ... (labels). The identity is
`derive_session_id(wireguard_pubkey)`, bound by `user.opdbus.session_id` and
`user.opdbus.wireguard_public_key` on the instance. The boot service reads the name from
`/etc/opdbus/3tched-container-name`, written by provisioning. Provisioning has
the decoy issue the identity (`op-decoy-issuer-iid1 issue-identity`, IID1) into
`/agent/user/issued_identity.iid1`; on first start the container runs
`op-identity-accept`, which verifies it against `/etc/opdbus/decoy-trust.json`
and installs `/agent/user/sealed_id` once.

Open: the genesis catalog hash comes from the
sealed blobs in `/dev/shm/opdbus/plugin-blobs` (`catalog-hash.sh`), which are
not staged on the host yet.

## Guest /run (2026-11-12)

The seed's systemd mounts a fresh tmpfs on `/run` after Incus attaches start-time
devices, hiding anything mounted under `/run`. Host devices therefore land in
`/opt/run-mounts/{opdbus,opdbus-egress,opdbus-sled,upgrade-3tched}`, and
provisioning writes `/etc/tmpfiles.d/opdbus-run-mounts.conf` in the sprout to
link the `/run` paths the seed expects (`/run/opdbus/lungs/lungs.sock`).
A raw.lxc tmpfs entry for `/run` was tried and breaks idmapped device mounts.

3tchedChatbot (2026-11-12, first provisioned as ID-1 and renamed): provisioned from the shared seed with a fresh sprout,
decoy-issued identity accepted (`54291774-4b0a-68b0-b55c-dc544900a8de`),
catalog hash `dfe09265…` from the SHM blobs sealed by the new release build.
Open: guest `lo` is down (the 127.0.0.1:3128 egress shim needs it); 3tchedFS
still fails because nothing binds `lungs.sock` and the guest `/dev/shm/opdbus`
catalog is empty; the new op-grpc-bridge is not installed in the sprout.

## Door identity (2026-11-13)

The door (op-grpc-bridge `5807e30e`) adopts the container's decoy-issued
identity at startup: it verified `/agent/user/issued_identity.iid1` and
`sealed_id` against `/etc/opdbus/decoy-trust.json` and committed session
`54291774-4b0a-68b0-b55c-dc544900a8de` as a `service` record. A restart reuses
the record. After a host reboot clears the sled, the next start commits it again
from `sealed_id`.
