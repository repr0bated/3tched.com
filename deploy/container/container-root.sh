#!/usr/bin/env bash
# =============================================================================
# 3tched container root: sealed seed /dev/sda4 + per-container Btrfs sprout.
#
#   container-root.sh mount   attach and mount the root (creates the sprout
#                             once if it does not exist yet)
#   container-root.sh verify  check the mounted root is the sprout of the seed
#   container-root.sh umount  unmount the root and detach the loop
#
# Membership change (btrfs device add) happens only when the sprout image is
# created. Boot, start and restart only attach, scan and mount; they never add
# or remove members. The sealed seed is never mounted read-write or retuned.
# =============================================================================
set -euo pipefail

readonly CONTAINER_NAME="${CONTAINER_NAME:-3tchedChatbot}"
readonly POOL="${POOL:-3tched-pool}"
readonly SEED_DEV="/dev/disk/by-uuid/dcfbc0a6-442d-474f-b636-fe17d25eaaf1"   # /dev/sda4
readonly DATA_DIR="/var/lib/incus/storage-pools/${POOL}/containers/${CONTAINER_NAME}"
readonly ROOTFS="${DATA_DIR}/rootfs"
readonly DELTA_IMG="${DATA_DIR}/cozo_delta.img"
readonly DELTA_SIZE="20G"
readonly STAGE="/run/3tched-sprout/${CONTAINER_NAME}"
# The seed's @ is a read-only subvolume. Each sprout gets one writable
# snapshot @root of it at creation; @ stays as the pristine upgrade baseline.
readonly ROOT_SUBVOL="@root"
readonly MOUNT_OPTS="rw,noatime,compress=zstd:3,space_cache=v2,subvol=${ROOT_SUBVOL}"

die() { echo "FATAL: $*" >&2; exit 1; }

seed_fsid() { blkid -s UUID -o value "$(readlink -f "${SEED_DEV}")"; }

delta_loop() { # existing loop for the image, or a new one
  local l
  l="$(losetup -j "${DELTA_IMG}" -O NAME -n | head -n1)"
  [ -n "$l" ] || l="$(losetup --find --show "${DELTA_IMG}")"
  echo "$l"
}

create_once() {
  [ -b "${SEED_DEV}" ] || die "seed ${SEED_DEV} missing"
  btrfs inspect-internal dump-super "${SEED_DEV}" | grep -q SEEDING \
    || die "seed has no SEEDING flag"
  findmnt -rn -S "$(readlink -f "${SEED_DEV}")" >/dev/null \
    && die "seed is mounted standalone; unmount it first (holds the device)"
  ( set -o noclobber; : > "${DELTA_IMG}" )
  chattr +C "${DELTA_IMG}"
  truncate -s "${DELTA_SIZE}" "${DELTA_IMG}"
  local loop; loop="$(delta_loop)"
  mkdir -p "${STAGE}"
  mount -t btrfs -o ro "${SEED_DEV}" "${STAGE}"
  if ! btrfs device add -f "${loop}" "${STAGE}"; then
    umount "${STAGE}"; losetup -d "${loop}"; rm -f "${DELTA_IMG}"
    die "btrfs device add failed; sprout image removed"
  fi
  mount -o remount,rw "${STAGE}"
  btrfs subvolume snapshot "${STAGE}/@" "${STAGE}/${ROOT_SUBVOL}"
  umount "${STAGE}"
  echo "sprout created: ${DELTA_IMG} on ${loop} (seed $(seed_fsid))"
}

ensure_root_subvol() { # one-time for a sprout created before @root existed
  local loop; loop="$(delta_loop)"
  btrfs device scan "$(readlink -f "${SEED_DEV}")" "${loop}" >/dev/null
  mkdir -p "${STAGE}"
  mount -t btrfs -o rw,noatime "${loop}" "${STAGE}"
  [ -d "${STAGE}/${ROOT_SUBVOL}" ] || btrfs subvolume snapshot "${STAGE}/@" "${STAGE}/${ROOT_SUBVOL}"
  umount "${STAGE}"
}

do_mount() {
  [ -d "${ROOTFS}" ] || die "${ROOTFS} missing (incus init first)"
  if mountpoint -q "${ROOTFS}"; then echo "root already mounted"; return; fi
  [ -e "${DELTA_IMG}" ] || create_once
  ensure_root_subvol
  local loop; loop="$(delta_loop)"
  btrfs device scan "$(readlink -f "${SEED_DEV}")" "${loop}" >/dev/null
  mount -t btrfs -o "${MOUNT_OPTS}" "${loop}" "${ROOTFS}"
  echo "root mounted: ${loop} ${ROOT_SUBVOL} -> ${ROOTFS}"
}

do_verify() {
  mountpoint -q "${ROOTFS}" || die "${ROOTFS} not mounted"
  local src; src="$(findmnt -rn -o SOURCE "${ROOTFS}")"
  btrfs filesystem show "${ROOTFS}" | grep -q "$(readlink -f "${SEED_DEV}")" \
    || die "root ${src} does not include the seed device"
  [ -f "${ROOTFS}/etc/os-release" ] || die "root has no /etc/os-release"
  findmnt -rn -o OPTIONS "${ROOTFS}" | grep -qE '(^|,)rw(,|$)' || die "root is not rw"
  [ "$(btrfs property get "${ROOTFS}" ro)" = "ro=false" ] || die "root subvolume is read-only"
  echo "root ok: ${src} -> ${ROOTFS}; $(. "${ROOTFS}/etc/os-release"; echo "${PRETTY_NAME}")"
}

do_umount() {
  if mountpoint -q "${ROOTFS}"; then umount "${ROOTFS}"; fi
  local l; l="$(losetup -j "${DELTA_IMG}" -O NAME -n | head -n1)"
  [ -z "$l" ] || losetup -d "$l"
}

case "${1:-}" in
  mount) do_mount ;;
  verify) do_verify ;;
  umount) do_umount ;;
  *) die "usage: $0 mount|verify|umount" ;;
esac
