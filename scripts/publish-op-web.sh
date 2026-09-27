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
npm run build -- --base "$url_prefix"

privileged=()
if [[ ! -d "$static_root" || ! -w "$static_root" ]]; then
  privileged=(sudo)
fi

"${privileged[@]}" install -d -m 0755 "$target_dir"
if [[ -z "$relative_path" ]]; then
  "${privileged[@]}" rsync -a --delete "$project_root/dist/assets/" "$target_dir/assets/"
else
  "${privileged[@]}" rsync -a --delete --exclude=index.html "$project_root/dist/" "$target_dir/"
fi
"${privileged[@]}" install -m 0644 "$project_root/dist/index.html" "$target_dir/index.html"

echo "Published 3tched UI to $target_dir"
echo "Open http://<op-web host>:8080${url_prefix}"
