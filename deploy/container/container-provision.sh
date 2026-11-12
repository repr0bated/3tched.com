#!/usr/bin/env bash
# =============================================================================
# 3tched container provisioner — 3tchedChatbot
#
# Owner decisions, 2026-11-11 omp session (applied 2026-11-12):
#   - Root OS seed is /dev/sda4: sealed Btrfs (SEEDING set), Ubuntu 26.04.
#     No seed.img, no 40G LV.
#   - Upgrade layer is /dev/sda5 subvolume @, mounted read-only at
#     /run/mounts/upgrade-3tched. Both are host fstab mounts.
#   - Container root boots from the sealed seed: /dev/sda4 + a per-container
#     writable Btrfs sprout (device add once, at creation). The seed is not
#     also mounted standalone: that holds sda4 and the sprout fails (EBUSY).
#   - The upgrade layer is passed in read-only for the in-container overlay.
#   - Incus pool is 3tched-pool: one 150G sparse Btrfs loop file owned by
#     Incus (/var/lib/incus/disks/3tched-pool.img), mounted by Incus at
#     /var/lib/incus/storage-pools/3tched-pool. There is no plain "3tched".
#   - The per-container directory, the same for Incus and Cozo, is
#     /var/lib/incus/storage-pools/3tched-pool/containers/<container>/.
#     It is the identity Cozo store root.
#   - Persistence of the root is the sprout: a copy of the template in
#     /var/lib/incus/disks/ (DELTA_TEMPLATE) is added with btrfs device add to
#     the shared seed. No snapshot of the seed is taken.
#   - RocksDB is an Incus custom volume in 3tched-pool, copied from the
#     template volume rocksdb-template and attached as a filesystem at
#     /var/lib/rocksdb (a container cannot take custom block volumes).
#   - Btrfs is OS persistence; RocksDB is user persistence (private memory
#     Cozo and the identity sled). Snowball is captured by vectorization, does
#     not persist, and is not stored in RocksDB (guest /run tmpfs).
#   - /agent/user holds sealed_id; the host has read-write access to it.
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

readonly SEED_DEV_UUID="dcfbc0a6-442d-474f-b636-fe17d25eaaf1"     # /dev/sda4
readonly UPGRADE_DEV_UUID="04f6a708-1e92-4468-ba94-e2e7c2cbce7d"  # /dev/sda5
readonly SEED_MNT="/run/mounts/seed-3tched"
readonly UPGRADE_MNT="/run/mounts/upgrade-3tched"

readonly DATA_DIR="/var/lib/incus/storage-pools/${POOL}/containers/${CONTAINER_NAME}"
readonly ROCKSDB_TEMPLATE_VOL="rocksdb-template"
readonly ROCKSDB_VOL="${CONTAINER_NAME}-rocksdb"
readonly ROCKSDB_STORES="cozo sled"
readonly SUBVOL_DIR="${DATA_DIR}/subvolumes"
readonly DELTA_IMG="${DATA_DIR}/cozo_delta.img"

die() { echo "FATAL: $*" >&2; exit 1; }
step() { echo "[$1] $2"; }

# --- 1. Host seed and upgrade layers (read-only, fstab) ----------------------
step 1/8 "Upgrade ${UPGRADE_MNT} read-only; seed ${SEED_MNT} not mounted standalone"
ensure_fstab() { # $1 = mount point, $2 = full fstab line
  grep -qE "[[:space:]]$1[[:space:]]" /etc/fstab || echo "$2" >> /etc/fstab
}
# The sealed seed is used only through each container's sprout. A standalone
# mount of /dev/sda4 holds the device and the sprout mount fails with EBUSY.
sed -i "\#[[:space:]]${SEED_MNT}[[:space:]]#d" /etc/fstab
if mountpoint -q "${SEED_MNT}"; then umount "${SEED_MNT}"; fi
ensure_fstab "${UPGRADE_MNT}" \
  "UUID=${UPGRADE_DEV_UUID} ${UPGRADE_MNT} btrfs ro,relatime,subvol=@,nofail,x-mount.mkdir 0 0"
for m in "${UPGRADE_MNT}"; do
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
incus profile show "${PROFILE}" >/dev/null 2>&1 || incus profile create "${PROFILE}"
incus profile edit "${PROFILE}" < ./incus-profile.yaml

# --- 4. Instance (one time). Its directory is the Cozo store root. -----------
step 4/8 "Instance ${CONTAINER_NAME} on ${POOL}"
# Profile host-path sources must exist before Incus validates the devices.
mkdir -p /run/opdbus/lungs /run/opdbus-egress /run/mounts/3tched/"${CONTAINER_NAME}"
if ! incus info "${CONTAINER_NAME}" >/dev/null 2>&1; then
  # --empty: Incus unpacks no image. The rootfs directory stays empty and the
  # sprout (shared seed @ + this container's cozo_delta.img) is mounted on it.
  incus init --empty "${CONTAINER_NAME}" --profile "${PROFILE}" --storage "${POOL}"
fi
incus config set "${CONTAINER_NAME}" \
  user.opdbus.session_uuid="${SESSION_UUID}" \
  user.opdbus.principal_id="${PRINCIPAL_ID}" \
  user.opdbus.wireguard_pubkey="${WG_PUBKEY}" \
  user.opdbus.cozo_root="${DATA_DIR}" \
  boot.autostart=false
[ -d "${DATA_DIR}" ] || die "${DATA_DIR} missing after incus init"

# --- 5. RocksDB: custom volume copied from the pool template (one time) -------
step 5/8 "RocksDB volume ${POOL}/${ROCKSDB_VOL} from ${ROCKSDB_TEMPLATE_VOL}"
if ! incus storage volume show "${POOL}" "${ROCKSDB_TEMPLATE_VOL}" >/dev/null 2>&1; then
  incus storage volume create "${POOL}" "${ROCKSDB_TEMPLATE_VOL}"
  tpl="/var/lib/incus/storage-pools/${POOL}/custom/default_${ROCKSDB_TEMPLATE_VOL}"
  chattr +C "${tpl}"   # No-CoW for RocksDB; inherited by new files and copies
  for d in ${ROCKSDB_STORES}; do install -d -m 0700 "${tpl}/$d"; done
fi
incus storage volume show "${POOL}" "${ROCKSDB_VOL}" >/dev/null 2>&1 || \
  incus storage volume copy "${POOL}/${ROCKSDB_TEMPLATE_VOL}" "${POOL}/${ROCKSDB_VOL}"
# The old loop-mounted ext4 image is retired; drop its fstab line.
sed -i "\#[[:space:]]${DATA_DIR}/mnt/rocksdb[[:space:]]#d" /etc/fstab

# --- 6. /agent directories and identity sled -----------------------------------
step 6/8 "/agent directories and identity sled"
mkdir -p "${SUBVOL_DIR}"/{memory,skills,soul,rules,shared}
# /agent/user is the identity sled: a real Btrfs subvolume (rw). A plain
# directory left by an earlier run is converted once, contents kept.
if ! btrfs subvolume show "${SUBVOL_DIR}/user" >/dev/null 2>&1; then
  if [ -d "${SUBVOL_DIR}/user" ]; then
    mv "${SUBVOL_DIR}/user" "${SUBVOL_DIR}/user.pre-subvol"
    btrfs subvolume create "${SUBVOL_DIR}/user"
    cp -a "${SUBVOL_DIR}/user.pre-subvol/." "${SUBVOL_DIR}/user/"
    rm -rf "${SUBVOL_DIR}/user.pre-subvol"
  else
    btrfs subvolume create "${SUBVOL_DIR}/user"
  fi
fi
if [ ! -e "${SUBVOL_DIR}/user/session.json" ]; then
  cat > "${SUBVOL_DIR}/user/session.json" <<EOF
{
  "container_name": "${CONTAINER_NAME}",
  "session_id": "${SESSION_UUID}",
  "principal_id": "${PRINCIPAL_ID}",
  "wireguard_pubkey": "${WG_PUBKEY}",
  "lungs_socket": "/run/opdbus/lungs/lungs.sock",
  "cozo_rocksdb_mount": "/var/lib/rocksdb",
  "sealed_id": "/agent/user/sealed_id",
  "egress_proxy": "http://127.0.0.1:3128"
}
EOF
fi

# --- 7. Per-instance host-path devices (paths are under DATA_DIR) ------------
step 7/8 "Instance devices"
# shift=true: idmapped mount, so host root-owned paths are root in the guest.
add_disk() { # name, source, path, readonly
  if incus config device get "${CONTAINER_NAME}" "$1" source >/dev/null 2>&1; then
    incus config device set "${CONTAINER_NAME}" "$1" source="$2" path="$3" readonly="$4" shift=true
  else
    incus config device add "${CONTAINER_NAME}" "$1" disk source="$2" path="$3" readonly="$4" shift=true
  fi
}
incus config device remove "${CONTAINER_NAME}" rocksdb-storage >/dev/null 2>&1 || true
incus config device add "${CONTAINER_NAME}" rocksdb-storage disk \
  pool="${POOL}" source="${ROCKSDB_VOL}" path=/var/lib/rocksdb
incus config device remove "${CONTAINER_NAME}" snowball-ledger >/dev/null 2>&1 || true
incus config device remove "${CONTAINER_NAME}" seed-lower >/dev/null 2>&1 || true
add_disk upgrade-lower   "${UPGRADE_MNT}"      /run/mounts/upgrade-3tched true
for d in user memory skills; do
  add_disk "agent-$d" "${SUBVOL_DIR}/$d" "/agent/$d" false
done
for d in soul rules shared; do
  add_disk "agent-$d" "${SUBVOL_DIR}/$d" "/agent/$d" true
done
# sealed_id (SID1 identity + NextDNS, one sealed object) lives in the sled and
# is bound read-only over itself. required=false until it is minted.
if ! incus config device get "${CONTAINER_NAME}" agent-sealed-id source >/dev/null 2>&1; then
  incus config device add "${CONTAINER_NAME}" agent-sealed-id disk \
    source="${SUBVOL_DIR}/user/sealed_id" path=/agent/user/sealed_id \
    readonly=true shift=true required=false
fi

# --- 7b. Root from the sealed seed: sda4 + this container's writable sprout ---
# The btrfs device add runs once, when the sprout image is created. Every later
# boot only attaches the loop, scans, and mounts the existing sprout (no member
# changes). The sprout's @ is mounted over the Incus rootfs directory.
step 7b/8 "Root ${DATA_DIR}/rootfs from seed ${SEED_DEV_UUID} + sprout ${DELTA_IMG}"
./container-root.sh mount
./container-root.sh verify

# The seed carries hostname "seed". Name this root after its container.
echo "${CONTAINER_NAME}" > "${DATA_DIR}/rootfs/etc/hostname"
sed -i '/^127\.0\.1\.1[[:space:]]/d' "${DATA_DIR}/rootfs/etc/hosts"
echo "127.0.1.1 ${CONTAINER_NAME}" >> "${DATA_DIR}/rootfs/etc/hosts"

# --- 8. Start -------------------------------------------------------------------
step 8/8 "Start ${CONTAINER_NAME}"
if [ "$(incus list "${CONTAINER_NAME}" -c s -f csv)" != "RUNNING" ]; then
  incus start "${CONTAINER_NAME}"
fi

# The Devuan image ran runit; the Ubuntu seed runs systemd. Install the runit
# egress shim only when the guest actually has runsvdir.
if incus exec "${CONTAINER_NAME}" -- test -x /usr/bin/runsvdir; then
  incus exec "${CONTAINER_NAME}" -- mkdir -p /etc/sv/opdbus-egress-proxyd /etc/runit/runsvdir/default
  incus file push --create-dirs --mode 0755 --uid 0 --gid 0 \
    ./runit/opdbus-egress-proxyd/run \
    "${CONTAINER_NAME}/etc/sv/opdbus-egress-proxyd/run"
  incus exec "${CONTAINER_NAME}" -- ln -sfn /etc/sv/opdbus-egress-proxyd /etc/runit/runsvdir/default/opdbus-egress-proxyd
fi
echo "Container ${CONTAINER_NAME} (${SESSION_UUID}) started on ${POOL}; Cozo root ${DATA_DIR}."
