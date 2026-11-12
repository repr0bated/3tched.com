#!/bin/sh
# catalog-hash.sh <plugin-blob-dir>
# Print the sealed catalog hash of the blobs in <dir>: the blake3 fold over the
# sorted (plugin_id, schema_hash) pairs, the same value op-blob computes. The
# directory's .manifest.json catalog_hash must agree, or this fails.
set -eu
DIR=$1
OPBLOB=${OPBLOB:-/usr/local/bin/opblob}
[ -f "$DIR/.manifest.json" ] || { echo "no sealed catalog in $DIR" >&2; exit 1; }
leaves=$(for b in "$DIR"/*.blob; do
  "$OPBLOB" inspect "$b" | awk '/^plugin /{p=$2} /^schema /{print p "\t" $3}'
done | LC_ALL=C sort)
[ -n "$leaves" ] || { echo "no blobs in $DIR" >&2; exit 1; }
hash=$(printf '%s\n' "$leaves" | while IFS="$(printf '\t')" read -r id schema; do
  printf '%s\000%s\000' "$id" "$schema"
done | b3sum --no-names)
want=$(jq -r .catalog_hash "$DIR/.manifest.json")
[ "$hash" = "$want" ] || { echo "catalog hash $hash does not match manifest $want" >&2; exit 1; }
echo "$hash"
