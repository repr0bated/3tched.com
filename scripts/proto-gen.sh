#!/usr/bin/env bash
# Regenerate src/grpc/gen from proto/operation.proto.
#
# proto/operation.proto is a verbatim copy of crates/op-grpc-bridge/proto/operation.proto
# from the OP-DBUS repository; proto/PROVENANCE records the source commit. Only
# PluginService.CallMethod is used by this UI, but the whole file is generated so
# the copy stays byte-identical to the bridge's contract.
set -euo pipefail

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

if ! command -v protoc >/dev/null 2>&1; then
  echo "protoc is required (system package)." >&2
  exit 2
fi

rm -rf src/grpc/gen
mkdir -p src/grpc/gen
protoc \
  --plugin=protoc-gen-ts=./node_modules/.bin/protoc-gen-ts \
  --ts_out=src/grpc/gen \
  --ts_opt=long_type_string,ts_nocheck,eslint_disable \
  -I proto \
  proto/operation.proto

echo "Generated src/grpc/gen from proto/operation.proto"
