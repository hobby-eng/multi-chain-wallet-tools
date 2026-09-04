#!/usr/bin/env bash
set -euo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
target="artifacts"
source_path="/dist/."
destination="$root/dist"
expected_path="release/SHA256SUMS"

if [[ "${1:-}" == "--wasm" ]]; then
  target="wasm-artifacts"
  source_path="/generated/."
  destination="$root/packages/dash-shielded-wasm/generated"
  expected_path="dash_shielded_wasm_bg.wasm"
  shift
fi
if (( $# != 0 )); then
  echo "Usage: $0 [--wasm]" >&2
  exit 2
fi

image="multi-chain-wallet-tools-reproducible:$target"
temporary="$(mktemp -d)"
container_id=""

cleanup() {
  if [[ -n "$container_id" ]]; then
    docker rm --force "$container_id" >/dev/null 2>&1 || true
  fi
  rm -rf -- "$temporary"
}
trap cleanup EXIT

cd "$root"
docker version
docker build \
  --platform linux/amd64 \
  --network host \
  --file Dockerfile.reproducible \
  --target "$target" \
  --tag "$image" \
  .
container_id="$(docker create "$image" /bin/true)"
docker cp "$container_id:$source_path" "$temporary"

if [[ ! -f "$temporary/$expected_path" ]]; then
  echo "The reproducible image did not contain $expected_path." >&2
  exit 1
fi

rm -rf -- "$destination"
mkdir -p -- "$destination"
cp -a -- "$temporary/." "$destination/"

if [[ "$target" == "wasm-artifacts" ]]; then
  echo "Replaced the committed generated WASM inputs with the canonical container build."
else
  cat "$destination/release/SHA256SUMS"
  echo "Copied the canonical container build to dist/."
fi
