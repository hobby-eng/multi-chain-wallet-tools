#!/usr/bin/env bash
set -euo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
# The Node orchestrator owns catalog projection, Docker copy-out and cleanup for both entry points.
exec node "$root/tooling/build-reproducible.mjs" "$@"
