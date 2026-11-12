#!/usr/bin/env bash
# =============================================================================
# 3tched container provisioner — 3tchedChatbot
#
# Owner decisions, 2026-11-11 omp session (applied 2026-11-12):
#   - Root OS seed is /dev/sda4: sealed Btrfs (SEEDING set), Ubuntu 26.04,
#     mounted read-only at /run/mounts/seed-3tched. No seed.img, no 40G LV.
#   - Upgrade layer is /dev/sda5 subvolume @, mounted read-only at
#     /run/mounts/upgrade-3tched. Both are host fstab mounts.
#   - Inside the container, OverlayFS uses upgrade then seed as read-only
#     lower layers after the root is mounted. Both are passed in read-only.
#   - Incus pool is 3tched-pool: one 150G sparse Btrfs loop file owned by
#     Incus (/var/lib/incus/disks/3tched-pool.img), mounted by Incus at
#     /var/lib/incus/storage-pools/3tched-pool. There is no plain "3tched".
#   - The per-container directory, the same for Incus and Cozo, is
#     /var/lib/incus/storage-pools/3tched-pool/containers/<container>/.
#     It is the identity Cozo store root.
#   - RocksDB gets its own sparse raw ext4 image in that directory, created
#     once at provisioning with the RocksDB-tuned mkfs flags. Incus bind-mounts
#     regular files for containers, so the host loop-mounts the image (fstab)
#     and the disk device passes the mounted directory to /var/lib/rocksdb.
#   - The snowball ledger is the one host-written mount:
#     <container dir>/snowball -> /var/lib/opdbus/snowball (rw).
#   - The WireGuard key is the same as the wg-opdbus server on 10.0.0.1.
#
# One-time steps (image creation, fstab line, incus init) are skipped when
# their result already exists. Re-running never reformats or re-creates.
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")"

readonly CONTAINER_NAME="3tchedChatbot"
readonly SESSION_UUID="b0c777e3-8f42-4d91-9e1a-7c3b5a9e1201"
readonly PRINCIPAL_ID="princ_blake3_7f9a2c41e80b3d19a65e0c21"
# Owner: the chatbot uses the same key as the WireGuard server on 10.0.0.1
# (decoy wg-opdbus interface public key).
readonly WG_PUBKEY="wNhmhGDpdkScmSdcHnzhr/1vmTIL5wxLXcve/jwk9xE="

readonly POOL="3tched-pool"
readonly POOL_SIZE="150GiB"
readonly PROFILE="opdbus-3tched-3tchedchatbot"
readonly IMAGE="opdbus-seed-base"

readonly SEED_DEV_UUID="dcfbc0a6-442d-474f-b636-fe17d25eaaf1"     # /dev/sda4
readonly UPGRADE_DEV_UUID="04f6a708-1e92-4468-ba94-e2e7c2cbce7d"  # /dev/sda5
readonly SEED_MNT="/run/mounts/seed-3tched"
readonly UPGRADE_MNT="/run/mounts/upgrade-3tched"

readonly DATA_DIR="/var/lib/incus/storage-pools/${POOL}/containers/${CONTAINER_NAME}"
readonly ROCKSDB_IMG="${DATA_DIR}/cozo_rocksdb.img"
readonly ROCKSDB_MNT="${DATA_DIR}/mnt/rocksdb"
readonly SNOWBALL_DIR="${DATA_DIR}/snowball"
readonly SUBVOL_DIR="${DATA_DIR}/subvolumes"

die() { echo "FATAL: $*" >&2; exit 1; }
step() { echo "[$1] $2"; }

# --- 1. Host seed and upgrade layers (read-only, fstab) ----------------------
step 1/8 "Seed ${SEED_MNT} and upgrade ${UPGRADE_MNT}, both read-only"
ensure_fstab() { # $1 = mount point, $2 = full fstab line
  grep -qE "[[:space:]]$1[[:space:]]" /etc/fstab || echo "$2" >> /etc/fstab
}
ensure_fstab "${SEED_MNT}" \
  "UUID=${SEED_DEV_UUID} ${SEED_MNT} btrfs ro,relatime,nofail,x-mount.mkdir 0 0"
ensure_fstab "${UPGRADE_MNT}" \
  "UUID=${UPGRADE_DEV_UUID} ${UPGRADE_MNT} btrfs ro,relatime,subvol=@,nofail,x-mount.mkdir 0 0"
for m in "${SEED_MNT}" "${UPGRADE_MNT}"; do
  mkdir -p "$m"
  mountpoint -q "$m" || mount "$m"
  findmnt -no OPTIONS "$m" | grep -qE '(^|,)ro(,|$)' || die "$m is not read-only"
done
btrfs inspect-internal dump-super "/dev/disk/by-uuid/${SEED_DEV_UUID}" \
  | grep -q SEEDING || die "seed /dev/disk/by-uuid/${SEED_DEV_UUID} has no SEEDING flag"

# --- 2. Incus pool: 150G sparse loop, Incus-owned ----------------------------
step 2/8 "Pool ${POOL} (${POOL_SIZE} sparse loop, Incus-owned)"
if ! incus storage show "${POOL}" >/dev/null 2>&1; then
  incus storage create "${POOL}" btrfs size="${POOL_SIZE}"
elif [ "$(incus storage get "${POOL}" size)" != "${POOL_SIZE}" ]; then
  incus storage set "${POOL}" size="${POOL_SIZE}"
fi

# --- 3. Profile ----------------------------------------------------------------
step 3/8 "Profile ${PROFILE}"
incus image info "${IMAGE}" >/dev/null 2>&1 || die "Incus image ${IMAGE} is not imported"
incus profile show "${PROFILE}" >/dev/null 2>&1 || incus profile create "${PROFILE}"
incus profile edit "${PROFILE}" < ./incus-profile.yaml

# --- 4. Instance (one time). Its directory is the Cozo store root. -----------
step 4/8 "Instance ${CONTAINER_NAME} on ${POOL}"
if ! incus info "${CONTAINER_NAME}" >/dev/null 2>&1; then
  incus init "${IMAGE}" "${CONTAINER_NAME}" --profile "${PROFILE}" --storage "${POOL}"
fi
incus config set "${CONTAINER_NAME}" \
  user.opdbus.session_uuid="${SESSION_UUID}" \
  user.opdbus.principal_id="${PRINCIPAL_ID}" \
  user.opdbus.wireguard_pubkey="${WG_PUBKEY}" \
  user.opdbus.cozo_root="${DATA_DIR}"
[ -d "${DATA_DIR}" ] || die "${DATA_DIR} missing after incus init"

# --- 5. RocksDB ext4 image (one time), loop-mounted by host fstab -------------
step 5/8 "RocksDB ext4 ${ROCKSDB_IMG} -> ${ROCKSDB_MNT}"
mkdir -p "${ROCKSDB_MNT}"
if [ ! -e "${ROCKSDB_IMG}" ]; then
  # Exclusive create; No-CoW must be set while the file is empty.
  ( set -o noclobber; : > "${ROCKSDB_IMG}" )
  chattr +C "${ROCKSDB_IMG}"
  lsattr "${ROCKSDB_IMG}" | cut -d' ' -f1 | grep -q C || die "chattr +C failed on ${ROCKSDB_IMG}"
  truncate -s 50G "${ROCKSDB_IMG}"
  mkfs.ext4 -F -b 4096 -m 0 -T largefile \
    -O ^has_journal,extent,dir_index,64bit,flex_bg \
    -E lazy_itable_init=0,lazy_journal_init=0,discard \
    -L cozo-rocksdb "${ROCKSDB_IMG}"
fi
ensure_fstab "${ROCKSDB_MNT}" \
  "${ROCKSDB_IMG} ${ROCKSDB_MNT} ext4 loop,rw,noatime,nodiratime,discard,nofail 0 0"
mountpoint -q "${ROCKSDB_MNT}" || mount "${ROCKSDB_MNT}"

# --- 6. Snowball ledger and /agent directories --------------------------------
step 6/8 "Snowball ledger ${SNOWBALL_DIR} and /agent directories"
mkdir -p "${SNOWBALL_DIR}" \
  "${SUBVOL_DIR}"/{user,memory,skills,soul,rules,shared}
if [ ! -e "${SUBVOL_DIR}/user/session.json" ]; then
  cat > "${SUBVOL_DIR}/user/session.json" <<EOF
{
  "container_name": "${CONTAINER_NAME}",
  "session_id": "${SESSION_UUID}",
  "principal_id": "${PRINCIPAL_ID}",
  "wireguard_pubkey": "${WG_PUBKEY}",
  "lungs_socket": "/opt/run-mounts/ghostbridge/lungs.sock",
  "cozo_rocksdb_mount": "/var/lib/rocksdb",
  "snowball_ledger": "/var/lib/opdbus/snowball",
  "egress_proxy": "http://127.0.0.1:3128"
}
EOF
fi

# --- 7. Per-instance host-path devices (paths are under DATA_DIR) ------------
step 7/8 "Instance devices"
add_disk() { # name, source, path, readonly
  if incus config device get "${CONTAINER_NAME}" "$1" source >/dev/null 2>&1; then
    incus config device set "${CONTAINER_NAME}" "$1" source="$2" path="$3" readonly="$4"
  else
    incus config device add "${CONTAINER_NAME}" "$1" disk source="$2" path="$3" readonly="$4"
  fi
}
add_disk rocksdb-storage "${ROCKSDB_MNT}"      /var/lib/rocksdb          false
add_disk snowball-ledger "${SNOWBALL_DIR}"     /var/lib/opdbus/snowball  false
add_disk seed-lower      "${SEED_MNT}/@"       /run/mounts/seed-3tched   true
add_disk upgrade-lower   "${UPGRADE_MNT}"      /run/mounts/upgrade-3tched true
for d in user memory skills; do
  add_disk "agent-$d" "${SUBVOL_DIR}/$d" "/agent/$d" false
done
for d in soul rules shared; do
  add_disk "agent-$d" "${SUBVOL_DIR}/$d" "/agent/$d" true
done

# --- 8. Start -------------------------------------------------------------------
step 8/8 "Start ${CONTAINER_NAME}"
mkdir -p /run/opdbus /run/opdbus-egress /run/mounts/3tched/"${CONTAINER_NAME}"
incus start "${CONTAINER_NAME}"

# In-container runit service: socat 127.0.0.1:3128 -> host egress socket.
incus exec "${CONTAINER_NAME}" -- mkdir -p /etc/sv/opdbus-egress-proxyd /etc/runit/runsvdir/default
incus file push --create-dirs --mode 0755 --uid 0 --gid 0 \
  ./runit/opdbus-egress-proxyd/run \
  "${CONTAINER_NAME}/etc/sv/opdbus-egress-proxyd/run"
incus exec "${CONTAINER_NAME}" -- ln -sfn /etc/sv/opdbus-egress-proxyd /etc/runit/runsvdir/default/opdbus-egress-proxyd
echo "Container ${CONTAINER_NAME} (${SESSION_UUID}) started on ${POOL}; Cozo root ${DATA_DIR}."
