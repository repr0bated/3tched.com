#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
static_root="${OP_WEB_STATIC_DIR:-/usr/local/share/op-dbus/dashboard}"
landing="${LANDING:-}"
url_prefix="${URL_PREFIX:-}"

if [[ -n "$landing" && -n "$url_prefix" ]]; then
  echo "Set LANDING or URL_PREFIX, not both" >&2
  exit 2
fi
if [[ -n "$landing" ]]; then
  if [[ ! "$landing" =~ ^[A-Za-z0-9._-]+$ || "$landing" == "." || "$landing" == ".." ]]; then
    echo "LANDING must be a single name such as live, prod, or 3tched: $landing" >&2
    exit 2
  fi
  url_prefix="/${landing}/"
fi
if [[ -z "$url_prefix" ]]; then
  echo "Set LANDING to a mount name (live, prod, 3tched) or URL_PREFIX=/ for the dashboard root" >&2
  exit 2
fi
if [[ "$url_prefix" != "/" && "$url_prefix" != /*/ ]]; then
  echo "URL_PREFIX must begin and end with '/': $url_prefix" >&2
  exit 2
fi

relative_path="${url_prefix#/}"
relative_path="${relative_path%/}"
if [[ "$relative_path" == *".."* || "$relative_path" == *"//"* ]]; then
  echo "URL_PREFIX must identify a safe path: $url_prefix" >&2
  exit 2
fi
if [[ -n "$relative_path" && ! "$relative_path" =~ ^[A-Za-z0-9._/-]+$ ]]; then
  echo "URL_PREFIX contains unsupported characters: $url_prefix" >&2
  exit 2
fi
if [[ "$static_root" != /* || "$static_root" == "/" ]]; then
  echo "OP_WEB_STATIC_DIR must be a specific absolute directory: $static_root" >&2
  exit 2
fi

if [[ -z "$relative_path" ]]; then
  # Root mount: this UI is op-web's dashboard. Only this build's own files are
  # replaced (assets/ and index.html); sibling mounts and host-owned files in the
  # static root are left alone.
  target_dir="${static_root%/}"
else
  target_dir="${static_root%/}/$relative_path"
fi

cd "$project_root"
SVELTEKIT_BASE_PATH="${url_prefix%/}" npm run build

# A new index replaces any host-injected runtime configuration. Verify the
# build contains its own public endpoints before replacing the served files.
node --input-type=module <<'NODE'
import { readFileSync, readdirSync } from "node:fs";
import { loadEnv } from "vite";

const config = loadEnv("production", process.cwd(), "VITE_OPDBUS_");
const assets = readdirSync("dist/assets", { recursive: true })
  .filter((file) => file.endsWith(".js"))
  .map((file) => readFileSync(`dist/assets/${file}`, "utf8"));

for (const key of ["VITE_OPDBUS_DOOR", "VITE_OPDBUS_ISSUER"]) {
  const value = config[key]?.trim();
  if (!value || !assets.some((asset) => asset.includes(value))) {
    throw new Error(`Cannot publish: the dashboard build is missing ${key}.`);
  }
}
NODE

privileged=()
if [[ ! -d "$static_root" || ! -w "$static_root" ]]; then
  privileged=(sudo)
fi

publish_dir="$target_dir"
if [[ -z "$relative_path" ]]; then
  overlay="${OP_WEB_DASHBOARD_OVERLAY:-}"
  if [[ -z "$overlay" ]]; then
    for candidate in "$target_dir/index.html" "$target_dir/assets"; do
      if [[ -L "$candidate" ]]; then
        resolved="$(readlink -f "$candidate" 2>/dev/null || true)"
        if [[ -n "$resolved" && ! -w "$(dirname "$resolved")" ]]; then
          overlay="/var/lib/op-dbus/dashboard-overlay-$(date -u +%Y%m%dT%H%MZ)"
          break
        fi
      elif [[ -e "$candidate" && ! -w "$candidate" ]]; then
        overlay="/var/lib/op-dbus/dashboard-overlay-$(date -u +%Y%m%dT%H%MZ)"
        break
      fi
    done
  fi
  if [[ -n "$overlay" ]]; then
    publish_dir="$overlay"
    echo "Dashboard root is read-only or symlinked into the release; publishing to $publish_dir"
  fi
fi

"${privileged[@]}" install -d -m 0755 "$publish_dir"
if [[ -z "$relative_path" ]]; then
  "${privileged[@]}" rsync -a --delete "$project_root/dist/assets/" "$publish_dir/assets/"
else
  "${privileged[@]}" rsync -a --delete --exclude=index.html "$project_root/dist/" "$publish_dir/"
fi
"${privileged[@]}" install -m 0644 "$project_root/dist/index.html" "$publish_dir/index.html"

if [[ "$publish_dir" != "$target_dir" ]]; then
  for name in index.html assets; do
    link="$target_dir/$name"
    if [[ -e "$link" || -L "$link" ]]; then
      "${privileged[@]}" rm -f "$link"
    fi
    "${privileged[@]}" ln -sfn "$publish_dir/$name" "$link"
  done
fi

echo "Published 3tched UI to $target_dir"
echo "Open http://<op-web host>:8080${url_prefix}"
