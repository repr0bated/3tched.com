#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
url_prefix="${URL_PREFIX:-/vercel-json-render/}"
static_root="${OP_WEB_STATIC_DIR:-/usr/local/share/op-dbus/dashboard}"

if [[ "$url_prefix" != /*/ ]]; then
  echo "URL_PREFIX must begin and end with '/': $url_prefix" >&2
  exit 2
fi

relative_path="${url_prefix#/}"
relative_path="${relative_path%/}"
if [[ -z "$relative_path" || "$relative_path" == *".."* || "$relative_path" == *"//"* ]]; then
  echo "URL_PREFIX must identify a safe non-root path: $url_prefix" >&2
  exit 2
fi
if [[ ! "$relative_path" =~ ^[A-Za-z0-9._/-]+$ ]]; then
  echo "URL_PREFIX contains unsupported characters: $url_prefix" >&2
  exit 2
fi
if [[ "$static_root" != /* || "$static_root" == "/" ]]; then
  echo "OP_WEB_STATIC_DIR must be a specific absolute directory: $static_root" >&2
  exit 2
fi

target_dir="${static_root%/}/$relative_path"

cd "$project_root"
npm run build -- --base "$url_prefix"

privileged=()
if [[ ! -d "$static_root" || ! -w "$static_root" ]]; then
  privileged=(sudo)
fi

"${privileged[@]}" install -d -m 0755 "$target_dir"
"${privileged[@]}" rsync -a --exclude=index.html "$project_root/dist/" "$target_dir/"
"${privileged[@]}" install -m 0644 "$project_root/dist/index.html" "$target_dir/index.html"

echo "Published Json Render UI to $target_dir"
echo "Open http://10.0.0.1:8080${url_prefix}"
