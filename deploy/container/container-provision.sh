#!/usr/bin/env bash
# =============================================================================
# OP-DBUS / 3tched Container Initialization & Hybrid Storage Provisioner
# Container: 3tchedChatbot (Session UUID: b0c777e3-8f42-4d91-9e1a-7c3b5a9e1201)
# Host OS: Devuan GNU/Linux (runit, D-Bus Control)
# Storage Stack:
#   - Outer LV (3tched-vg/3tched-seed): 40 GiB ext4 @ /run/mounts/seed-3tched
#   - Base Seed (seed.img): 16 GiB Btrfs (btrfstune -S 1)
#   - Sprout Delta (cozo_delta.img): 20 GiB sparse Btrfs sprout
#   - CozoDB RocksDB (cozo_rocksdb.img): 50 GiB flat ext4 (chattr +C)
#   - Upgrade Base (cozo_upgrade_base.img): 20 GiB read-only @ /mnt/upgrade
# =============================================================================
set -euo pipefail

readonly CONTAINER_NAME="3tchedChatbot"
readonly SESSION_UUID="b0c777e3-8f42-4d91-9e1a-7c3b5a9e1201"
readonly PRINCIPAL_ID="princ_blake3_7f9a2c41e80b3d19a65e0c21"
readonly WG_PUBKEY="wg1_K9xV3mP8qR2tL5nW7jY4hF6dS0aG1cB9vZ8uE3rT2wI="

# Stable mapper path. /dev/dm-3 is 3tched-vectors (10G btrfs), not this volume.
readonly OUTER_LV_DEV="/dev/mapper/3tched--vg-3tched--seed"
readonly OUTER_LV_MOUNT="/run/mounts/seed-3tched"
readonly SEED_IMG="/run/mounts/seed-3tched/seed.img"

readonly CONTAINER_DIR="/var/lib/opdbus/containers/${CONTAINER_NAME}"
readonly DELTA_IMG="/var/lib/opdbus/containers/3tchedChatbot/cozo_delta.img"
readonly ROCKSDB_IMG="/var/lib/opdbus/containers/3tchedChatbot/cozo_rocksdb.img"
readonly UPGRADE_IMG="/var/lib/opdbus/containers/3tchedChatbot/cozo_upgrade_base.img"

echo "[1/7] Mounting outer ext4 Logical Volume (${OUTER_LV_DEV}, 40 GiB) at ${OUTER_LV_MOUNT}..."
mkdir -p "${OUTER_LV_MOUNT}" "${CONTAINER_DIR}/subvolumes"
if ! mountpoint -q "${OUTER_LV_MOUNT}"; then
  mount -t ext4 -o rw,relatime,data=ordered "${OUTER_LV_DEV}" "${OUTER_LV_MOUNT}"
fi

echo "[2/7] Verifying immutable Btrfs seed image (${SEED_IMG}, 16 GiB)..."
if [[ ! -f "${SEED_IMG}" ]]; then
  truncate -s 16G "${SEED_IMG}"
  mkfs.btrfs -f -L "3tched-seed" "${SEED_IMG}"
  btrfstune -S 1 "${SEED_IMG}"
fi
LOOP_SEED="$(losetup --find --show --read-only "${SEED_IMG}")"
echo "  -> Attached seed.img on ${LOOP_SEED} (btrfstune -S 1 verified)"

echo "[3/7] Allocating writable sparse Btrfs sprout (${DELTA_IMG}, 20 GiB)..."
if [[ ! -f "${DELTA_IMG}" ]]; then
  truncate -s 20G "${DELTA_IMG}"
fi
LOOP_DELTA="$(losetup --find --show "${DELTA_IMG}")"

echo "[4/7] Sprouting Btrfs root filesystem for ${CONTAINER_NAME}..."
readonly ROOTFS_MNT="/var/lib/incus/storage-pools/3tched-pool/containers/${CONTAINER_NAME}/rootfs"
mkdir -p "${ROOTFS_MNT}"
if ! mountpoint -q "${ROOTFS_MNT}"; then
  mount -t btrfs -o ro "${LOOP_SEED}" "${ROOTFS_MNT}"
  btrfs device add -f "${LOOP_DELTA}" "${ROOTFS_MNT}"
  mount -o remount,rw,rw,noatime,compress=zstd:3,space_cache=v2 "${ROOTFS_MNT}"
fi

echo "[5/7] Provisioning sparse Zero-CoW ext4 CozoDB image (${ROCKSDB_IMG}, 50 GiB)..."
if [[ ! -f "${ROCKSDB_IMG}" ]]; then
  # CRITICAL: Disable Copy-on-Write (chattr +C) while the file is still 0 bytes.
  # truncate leaves the image sparse. Do not fallocate.
  touch "${ROCKSDB_IMG}"
  chattr +C "${ROCKSDB_IMG}"
  lsattr "${ROCKSDB_IMG}" | grep -q "C" || { echo "FATAL: chattr +C failed on ${ROCKSDB_IMG}"; exit 1; }
  truncate -s 50G "${ROCKSDB_IMG}"
  mkfs.ext4 -F -m 0 -E lazy_itable_init=1,lazy_journal_init=1 -L "cozo-rocksdb" "${ROCKSDB_IMG}"
fi

echo "[6/7] Preparing A/B Upgrade Staging image (${UPGRADE_IMG}, 20 GiB) & /agent subvolumes..."
if [[ ! -f "${UPGRADE_IMG}" ]]; then
  truncate -s 20G "${UPGRADE_IMG}"
  mkfs.btrfs -f -L "3tched-upgrade-stage" "${UPGRADE_IMG}"
fi

# Initialize /agent subvolumes and seal SID1 identity records
mkdir -p "${CONTAINER_DIR}/subvolumes/user" # /agent/user (rw)
mkdir -p "${CONTAINER_DIR}/subvolumes/memory" # /agent/memory (rw)
mkdir -p "${CONTAINER_DIR}/subvolumes/skills" # /agent/skills (rw)
mkdir -p "${CONTAINER_DIR}/subvolumes/soul" # /agent/soul (ro)
mkdir -p "${CONTAINER_DIR}/subvolumes/rules" # /agent/rules (ro)
mkdir -p "${CONTAINER_DIR}/subvolumes/shared" # /agent/shared (ro)

cat > "${CONTAINER_DIR}/subvolumes/user/session.json" <<EOF
{
  "container_name": "${CONTAINER_NAME}",
  "session_id": "${SESSION_UUID}",
  "principal_id": "${PRINCIPAL_ID}",
  "lungs_socket": "/opt/run-mounts/ghostbridge/lungs.sock",
  "cozo_rocksdb_mount": "/var/lib/rocksdb",
  "egress_proxy": "http://127.0.0.1:3128"
}
EOF

echo "[7/7] Applying Incus profile and launching NIC-less container ${CONTAINER_NAME}..."

ROCKSDB_MNT="${CONTAINER_DIR}/mnt/rocksdb"
UPGRADE_MNT="${CONTAINER_DIR}/mnt/upgrade"
mkdir -p "${ROCKSDB_MNT}" "${UPGRADE_MNT}" /run/mounts/3tched/3tchedChatbot
if ! mountpoint -q "${ROCKSDB_MNT}"; then
  mount -o loop,rw,noatime,nodiratime,barrier=0 "${ROCKSDB_IMG}" "${ROCKSDB_MNT}"
fi
if ! mountpoint -q "${UPGRADE_MNT}"; then
  mount -o loop,ro,noatime "${UPGRADE_IMG}" "${UPGRADE_MNT}"
fi

# Incus formats a block device it does not already own, so the seed sprout on
# loop1 is left mounted by the caller and the pool is a btrfs subvolume.
if ! incus storage show 3tched-pool >/dev/null 2>&1; then
  incus storage create 3tched-pool btrfs
fi

if ! incus image info opdbus-seed-base >/dev/null 2>&1; then
  echo "FATAL: Incus image opdbus-seed-base is not imported" >&2
  exit 1
fi

incus profile create "opdbus-3tched-3tchedchatbot" 2>/dev/null || true
incus profile edit "opdbus-3tched-3tchedchatbot" < ./incus-profile.yaml
if ! incus info "${CONTAINER_NAME}" >/dev/null 2>&1; then
  incus init "opdbus-seed-base" "${CONTAINER_NAME}" --profile "opdbus-3tched-3tchedchatbot"
fi
incus start "${CONTAINER_NAME}"

# In-container runit service: socat listens on 127.0.0.1:3128 and connects to
# the host egress socket bind-mounted at /run/opdbus-egress/http.sock.
# The guest image needs runit (sv, runsvdir) and socat. No systemd.
echo "Installing runit service opdbus-egress-proxyd inside ${CONTAINER_NAME}..."
incus exec "${CONTAINER_NAME}" -- mkdir -p /etc/sv/opdbus-egress-proxyd /etc/runit/runsvdir/default
incus file push --create-dirs --mode 0755 --uid 0 --gid 0 \
  ./runit/opdbus-egress-proxyd/run \
  "${CONTAINER_NAME}/etc/sv/opdbus-egress-proxyd/run"
incus exec "${CONTAINER_NAME}" -- ln -sfn /etc/sv/opdbus-egress-proxyd /etc/runit/runsvdir/default/opdbus-egress-proxyd
if [ -S /run/opdbus-egress/http.sock ]; then
  incus exec "${CONTAINER_NAME}" -- sv start opdbus-egress-proxyd
else
  echo "opdbus-egress-proxyd is installed. It stays down until host-bridge-after-deploy.sh creates /run/opdbus-egress/http.sock."
fi
echo "Container ${CONTAINER_NAME} (${SESSION_UUID}) is running."

