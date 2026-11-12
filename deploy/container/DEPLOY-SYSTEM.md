> **Superseded identity values (2026-11-12).** The session UUID and principal id below were hand-written in the imported bundle and do not match the code. The instance name is `derive_session_id(wireguard_pubkey)` and the decoy issues the SID1; see `container-provision.sh`.
> **Superseded 2026-11-12.** `container-provision.sh` and `incus-profile.yaml`
> carry the owner's 2026-11-11 decisions: seed `/dev/sda4` (ro), upgrade
> `/dev/sda5` `@` (ro), pool `3tched-pool` (150G sparse), Cozo root
> `/var/lib/incus/storage-pools/3tched-pool/containers/<container>/`, RocksDB
> ext4 image in that directory, snowball ledger mount. The seed.img, 40G LV,
> cozo_delta.img and opdbus-btrfs-sprout steps below are historical.

# OP-DBUS / 3tched Full System Deployment Runbook

> **Principle:** "The container is the identity; 3tchedFS is its lungs."

- **Container Identity:** `3tchedChatbot`
- **Anchored Session UUID:** `b0c777e3-8f42-4d91-9e1a-7c3b5a9e1201`
- **Principal ID (BLAKE3):** `princ_blake3_7f9a2c41e80b3d19a65e0c21`
- **Host Control Plane:** Debian GNU/Linux (systemd, D-Bus Control) (`org.opdbus.v1.Rovs`)
- **Tonic gRPC Service Door:** `svc0` (`10.0.0.2/24` on port `8090`)
- **3tchedFS Lungs UDS:** `/run/opdbus/lungs/lungs.sock`, same path on host and guest (fixed by the sealed seed)
- **Refinements Applied:** 1

## Quick Single-Command Bundle Deployment

If you downloaded `deploy-3tchedchatbot-bundle.sh`, run:

```bash
chmod +x deploy-3tchedchatbot-bundle.sh
sudo ./deploy-3tchedchatbot-bundle.sh
cd opdbus-3tchedchatbot-bundle
sudo ./host-boot-ovs.sh &
sudo ./container-provision.sh
```

---

## Phase 01: Host OS Packages (APT), systemd Supervision & OP-DBUS Authority

Prepare Debian GNU/Linux (systemd, D-Bus Control) with Incus, Btrfs/ext4 utilities, WireGuard, BLAKE3, and register the org.opdbus.v1.Rovs system D-Bus policy.

### Commands
```bash
# 1. Install core host packages on Debian GNU/Linux (systemd, D-Bus Control) (Debian/APT family)
apt-get update && apt-get install -y incus btrfs-progs e2fsprogs lvm2 openvswitch-switch \
  dbus libglib2.0-bin wireguard-tools b3sum fuse3 socat systemd-container

# 2. Ensure unprivileged UID/GID delegation matches idmap base (1000000)
grep -q "root:1000000:65536" /etc/subuid || \
  echo "root:1000000:65536" >> /etc/subuid
grep -q "root:1000000:65536" /etc/subgid || \
  echo "root:1000000:65536" >> /etc/subgid

# 3. Enable Incus, OpenvSwitch & D-Bus systemd units on Debian GNU/Linux (systemd, D-Bus Control)
systemctl enable --now dbus openvswitch-switch incus
incus admin init --minimal
```

### Verification
```bash
$ systemctl is-active dbus openvswitch-switch incus && gdbus introspect --system --dest org.opdbus.v1.Rovs --object-path /org/opdbus/v1/Rovs
active (dbus) · active (openvswitch-switch) · active (incus)
interface org.opdbus.v1.Rovs { methods: EnsureBridge, AttachPhysicalUplink, EnsureInternalPort... }
```

- Host OS configured as Debian GNU/Linux (systemd, D-Bus Control) using apt and systemd service management.
- Raw ovs-vsctl and ovs-ofctl invocations are forbidden by host policy; all bridge mutations go through org.opdbus.v1.Rovs.

## Phase 02: Host Network Fabric (ovsbr0) & Tonic gRPC Door (:8090)

Install and start the host-boot-ovs.sh systemd service (/etc/systemd/system/ovsbr0-network.service) on Debian GNU/Linux (systemd, D-Bus Control) to configure ovsbr0, enslave eth0, bind pub0 and svc0 (10.0.0.2/24), and open /run/opdbus/lungs/lungs.sock.

### Commands
```bash
# 1. Install generated host-boot-ovs.sh and systemd service unit on Debian GNU/Linux (systemd, D-Bus Control)
install -m 0750 ./host-boot-ovs.sh /usr/local/sbin/host-boot-ovs.sh
cat > /etc/systemd/system/ovsbr0-network.service <<'EOF'
[Unit]
Description=OP-DBUS Host OVS Bridge & Tonic gRPC Service Door
After=network-pre.target dbus.service openvswitch-switch.service
Before=incus.service

[Service]
Type=simple
ExecStart=/usr/local/sbin/host-boot-ovs.sh
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now ovsbr0-network.service
```

### Verification
```bash
$ ip -br addr show svc0 && ss -tlpn | grep ":8090" && ls -l /run/opdbus/lungs/lungs.sock
svc0 UNKNOWN 10.0.0.2/24
LISTEN 0 128 10.0.0.2:8090 0.0.0.0:* users:(("op-grpc-bridge",pid=912,fd=7))
srwxr-x--- 1 root opdbus 0 /run/opdbus/lungs/lungs.sock
```

- Physical interface eth0 carries raw L2 frames with zero host IP assigned.
- Decoy tunnel tun5 (Cloudflare WARP/MASQUE) terminates encrypted ingress/egress traffic.

## Phase 03: Hybrid Storage Stack: Outer ext4 LV, Btrfs Seed + Sprout & Zero-CoW RocksDB

Mount the 40 GiB outer ext4 LV (/dev/dm-3), seal seed.img (16 GiB) with btrfstune -S 1, sprout cozo_delta.img (20 GiB), and format cozo_rocksdb.img (50 GiB) with chattr +C.

### Commands
```bash
# 1. Mount outer ext4 LV (/dev/dm-3) at /run/mounts/seed-3tched
mkdir -p /run/mounts/seed-3tched /var/lib/opdbus/containers/3tchedChatbot/subvolumes
mount -t ext4 -o rw,relatime,data=ordered /dev/dm-3 /run/mounts/seed-3tched

# 2. Create or verify immutable Btrfs seed image (16 GiB)
truncate -s 16G /run/mounts/seed-3tched/seed.img
mkfs.btrfs -f -L "3tched-seed" /run/mounts/seed-3tched/seed.img
btrfstune -S 1 /run/mounts/seed-3tched/seed.img

# 3. Allocate writable Btrfs delta sprout (20 GiB)
truncate -s 20G /var/lib/opdbus/containers/3tchedChatbot/cozo_delta.img

# 4. Provision Zero-CoW flat ext4 image for CozoDB (50 GiB)
#    CRITICAL: Apply chattr +C while file is 0 bytes before fallocate!
rm -f /var/lib/opdbus/containers/3tchedChatbot/cozo_rocksdb.img
touch /var/lib/opdbus/containers/3tchedChatbot/cozo_rocksdb.img
chattr +C /var/lib/opdbus/containers/3tchedChatbot/cozo_rocksdb.img
fallocate -l 50G /var/lib/opdbus/containers/3tchedChatbot/cozo_rocksdb.img
mkfs.ext4 -F -m 0 -E lazy_itable_init=0,lazy_journal_init=0 -L "cozo-rocksdb" /var/lib/opdbus/containers/3tchedChatbot/cozo_rocksdb.img

# 5. Prepare A/B upgrade staging loop (20 GiB)
truncate -s 20G /var/lib/opdbus/containers/3tchedChatbot/cozo_upgrade_base.img
mkfs.btrfs -f -L "3tched-upgrade-stage" /var/lib/opdbus/containers/3tchedChatbot/cozo_upgrade_base.img
```

### Verification
```bash
$ lsattr /var/lib/opdbus/containers/3tchedChatbot/cozo_rocksdb.img && btrfs inspect-internal dump-super /run/mounts/seed-3tched/seed.img | grep -E "flags|SEEDING"
---------------C---- /var/lib/opdbus/containers/3tchedChatbot/cozo_rocksdb.img
flags 0x100000001 (WRITTEN | SEEDING)
```

- Kernel Btrfs BPF guards ignore /run/mounts/seed-3tched because the outer Logical Volume is formatted as ext4.
- CozoDB/RocksDB mounts at /var/lib/rocksdb with options: rw,noatime,nodiratime,barrier=0.

## Phase 04: WireGuard Keypair, SID1 BLAKE3 Minting & /agent Subvolumes

Mint the deterministic SID1 envelope for 3tchedChatbot (b0c777e3-8f42-4d91-9e1a-7c3b5a9e1201) and populate the 6 /agent subvolumes.

### Commands
```bash
# 1. Create /agent subvolume backing directories on host
mkdir -p /var/lib/opdbus/containers/3tchedChatbot/subvolumes/user # /agent/user (rw)
mkdir -p /var/lib/opdbus/containers/3tchedChatbot/subvolumes/memory # /agent/memory (rw)
mkdir -p /var/lib/opdbus/containers/3tchedChatbot/subvolumes/skills # /agent/skills (rw)
mkdir -p /var/lib/opdbus/containers/3tchedChatbot/subvolumes/soul # /agent/soul (ro)
mkdir -p /var/lib/opdbus/containers/3tchedChatbot/subvolumes/rules # /agent/rules (ro)
mkdir -p /var/lib/opdbus/containers/3tchedChatbot/subvolumes/shared # /agent/shared (ro)

# 2. Install sealed SID1 identity manifest into /agent/user/identity.json
install -m 0640 ./sid1-identity-manifest.json \
  /var/lib/opdbus/containers/3tchedChatbot/subvolumes/user/identity.json

# 3. Write session anchor into /agent/user/session.json
cat > /var/lib/opdbus/containers/3tchedChatbot/subvolumes/user/session.json <<'EOF'
{
  "container_name": "3tchedChatbot",
  "session_id": "b0c777e3-8f42-4d91-9e1a-7c3b5a9e1201",
  "principal_id": "princ_blake3_7f9a2c41e80b3d19a65e0c21",
  "kdf_domain": "opdbus.3tched.v1.session_kdf",
  "lungs_socket": "/run/opdbus/lungs/lungs.sock",
  "cozo_rocksdb_mount": "/var/lib/rocksdb"
}
EOF
```

### Verification
```bash
$ b3sum /var/lib/opdbus/containers/3tchedChatbot/subvolumes/user/identity.json /var/lib/opdbus/containers/3tchedChatbot/subvolumes/user/session.json
7f9a2c41e80b3d19a65e0c21...  /var/lib/opdbus/containers/3tchedChatbot/subvolumes/user/identity.json
9e1a7c3b5a9e1201b0c777e3...  /var/lib/opdbus/containers/3tchedChatbot/subvolumes/user/session.json
```

- Writable subvolumes: /agent/user, /agent/memory, /agent/skills.
- Read-only policy subvolumes: /agent/soul, /agent/rules, /agent/shared.

## Phase 05: Incus Profile Import, 3tchedFS Lungs Mount & NIC-less Container Launch

Apply opdbus-3tched-3tchedchatbot from incus-profile.yaml, mount 3tchedFS at /run/mounts/3tched/3tchedChatbot, and start 3tchedChatbot with zero network interfaces.

### Commands
```bash
# 1. Start 3tchedFS typed FUSE hierarchy for 3tchedChatbot on host
install -d -m 0755 /run/mounts/3tched/3tchedChatbot
3tchedfs-daemon \
  --spec ./3tchedfs-protocol.yaml \
  --mount /run/mounts/3tched/3tchedChatbot \
  --lungs-sock /run/opdbus/lungs/lungs.sock &

# 2. Import hardened Incus profile and launch NIC-less instance
incus profile create opdbus-3tched-3tchedchatbot 2>/dev/null || true
incus profile edit opdbus-3tched-3tchedchatbot < ./incus-profile.yaml
incus launch opdbus-seed-base 3tchedChatbot --profile opdbus-3tched-3tchedchatbot < ./instance-config.yaml

# 3. Bootstrap CozoDB Datalog schema inside container on /var/lib/rocksdb
incus exec 3tchedChatbot -- cozo-cli --engine rocksdb --path /var/lib/rocksdb/cozo.db \
  --init /agent/user/identity.json
```

### Verification
```bash
$ incus info 3tchedChatbot | grep -E "Name:|Status:|UUID:" && incus exec 3tchedChatbot -- ip link show
Name: 3tchedChatbot
Status: RUNNING
1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN mode DEFAULT group default qlen 1000
```

- Notice only '1: lo' exists inside 3tchedChatbot; there is no eth0 or veth device attached.
- Outbound HTTP/HTTPS requests inside the container use http://127.0.0.1:3128 -> /run/opdbus-egress/http.sock.

## Phase 06: End-to-End Runtime Smoke Test: 3tchedFS Breath, CozoDB & Egress Proxy

Verify that 3tchedChatbot can breathe an operation call through /opt/run-mounts/3tched, persist memory graphs to /var/lib/rocksdb, and enforce read-only policy subvolumes.

### Commands
```bash
# 1. Test 3tchedFS Lungs breath across /run/opdbus/lungs/lungs.sock
incus exec 3tchedChatbot -- sh -c '
  echo "{"bridge":"ovsbr0"}" > /opt/run-mounts/3tched/host.network.rovs/inspect_fabric/call &&
  cat /opt/run-mounts/3tched/host.network.rovs/inspect_fabric/status &&
  cat /opt/run-mounts/3tched/host.network.rovs/inspect_fabric/result
'

# 2. Verify read-only enforcement on /agent/soul and /agent/rules
incus exec 3tchedChatbot -- sh -c 'touch /agent/soul/tamper_test 2>&1 || echo "Read-only policy enforced"'

# 3. Stage an A/B upgrade snapshot into /mnt/upgrade
btrfs send /run/mounts/seed-3tched/snapshots/next-os | \
  incus exec 3tchedChatbot -- btrfs receive /mnt/upgrade
```

### Verification
```bash
$ incus exec 3tchedChatbot -- df -hT / /var/lib/rocksdb /mnt/upgrade
Filesystem     Type   Size  Mounted on
/dev/loop0     btrfs  20G   /
/dev/loop1     ext4   50G   /var/lib/rocksdb
/dev/loop2     btrfs  20G   /mnt/upgrade
```

- All 6 OP-DBUS / 3tched invariants are active and deterministically verifiable.
- Any subsequent natural-language refinements applied in this workbench automatically update these commands.

