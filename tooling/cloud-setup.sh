#!/usr/bin/env bash
# Prepares a Claude Code cloud session (Ubuntu 24.04, root) for this repository with the same
# pinned toolchains as the owner's machine (AGENTS.md, Toolchains): Node.js from .node-version,
# pnpm from package.json through Corepack, Rust and wasm-bindgen from tooling/toolchain-pins.json,
# the Playwright browsers of the pinned Playwright, Docker, and the sibling repositories that
# tooling and audits read next to this one. Each step is skipped when its result is already there,
# so the script can run again. It installs into ../workingspace, as on the owner's machine, where
# tooling/rust-toolchain.mjs looks for Cargo first.
#
# Usage: bash tooling/cloud-setup.sh
# Sibling branches: CLOUD_BRANCHES="mhfe=aud023-remediation mnemocode=main" (default: main).
# A step that the network or the sandbox refuses is reported at the end, and the exit status is 1.
set -uo pipefail

repository="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
parent="$(dirname -- "$repository")"
tools="$parent/workingspace"
node_version="$(tr -d '[:space:]' < "$repository/.node-version")"
rust_version="$(sed -n 's/.*"rust": *"\([^"]*\)".*/\1/p' "$repository/tooling/toolchain-pins.json")"
bindgen_version="$(sed -n 's/.*"wasmBindgen": *"\([^"]*\)".*/\1/p' "$repository/tooling/toolchain-pins.json")"
failed=()

mkdir -p "$tools"
export CARGO_HOME="$tools/cargo" RUSTUP_HOME="$tools/rustup"
export PATH="$tools/node/bin:$CARGO_HOME/bin:$PATH"

step() { printf '\n=== %s (%s)\n' "$1" "$(date -u +%H:%M:%SZ)"; }
fail() { echo "FAILED: $1"; failed+=("$1"); }

step "Node.js $node_version"
if [ "$("$tools/node/bin/node" --version 2>/dev/null)" != "v$node_version" ]; then
  archive="node-v$node_version-linux-x64.tar.xz"
  work="$(mktemp -d)"
  # nodejs.org with its published checksum; the npm registry's node-linux-x64 package otherwise.
  if curl -fsSL "https://nodejs.org/dist/v$node_version/$archive" -o "$work/$archive" \
    && curl -fsSL "https://nodejs.org/dist/v$node_version/SHASUMS256.txt" -o "$work/SHASUMS256.txt" \
    && (cd "$work" && grep " $archive\$" SHASUMS256.txt | sha256sum -c -); then
    rm -rf "$tools/node" && mkdir -p "$tools/node"
    tar -xJf "$work/$archive" -C "$tools/node" --strip-components=1
  elif (cd "$work" && npm pack --silent "node-linux-x64@$node_version" >/dev/null); then
    rm -rf "$tools/node" && mkdir -p "$tools/node"
    tar -xzf "$work"/node-linux-x64-*.tgz -C "$tools/node" --strip-components=1
  fi
  rm -rf "$work"
  [ "$("$tools/node/bin/node" --version 2>/dev/null)" = "v$node_version" ] || fail "Node.js $node_version"
fi

step "pnpm through Corepack, locked dependencies"
# The npm registry's node-linux-x64 package holds Node alone; Corepack then comes from npm.
[ -x "$tools/node/bin/corepack" ] || npm install --global --prefix "$tools/node" --silent corepack \
  || fail "Corepack"
if "$tools/node/bin/corepack" enable --install-directory "$tools/node/bin" \
  && (cd "$repository" && pnpm --version && pnpm install --frozen-lockfile); then
  :
else
  fail "pnpm install"
fi

step "Rust $rust_version with the wasm32 target"
if ! "$CARGO_HOME/bin/rustup" toolchain list 2>/dev/null | grep -q "^$rust_version"; then
  curl -fsSL https://sh.rustup.rs -o "$tools/rustup-init.sh" \
    && sh "$tools/rustup-init.sh" -y --no-modify-path --profile minimal --default-toolchain "$rust_version" \
    || fail "rustup $rust_version"
fi
"$CARGO_HOME/bin/rustup" target add --toolchain "$rust_version" wasm32-unknown-unknown >/dev/null \
  || fail "wasm32 target"
"$CARGO_HOME/bin/rustup" component add --toolchain "$rust_version" rustfmt clippy >/dev/null \
  || fail "rustfmt and clippy"

step "wasm-bindgen $bindgen_version"
if [ "$("$CARGO_HOME/bin/wasm-bindgen" --version 2>/dev/null)" != "wasm-bindgen $bindgen_version" ]; then
  RUSTUP_TOOLCHAIN="$rust_version" "$CARGO_HOME/bin/cargo" install --locked --quiet \
    wasm-bindgen-cli --version "$bindgen_version" || fail "wasm-bindgen $bindgen_version"
fi

step "Playwright browsers (Chromium, Firefox) with their system packages"
(cd "$repository" && pnpm exec playwright install --with-deps chromium firefox) || fail "Playwright browsers"

step "Docker"
if ! docker info >/dev/null 2>&1; then
  (setsid dockerd >"$tools/dockerd.log" 2>&1 &)
  for _ in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 1; done
fi
docker info >/dev/null 2>&1 || fail "Docker daemon (see $tools/dockerd.log)"

step "Sibling repositories"
for name in dash-wallet-tools mnemocode mhfe mhfe_spec; do
  branch="main"
  for pair in ${CLOUD_BRANCHES:-}; do [ "${pair%%=*}" = "$name" ] && branch="${pair#*=}"; done
  target="$parent/$name"
  if [ ! -d "$target/.git" ]; then
    git clone --quiet "https://github.com/hobby-eng/$name.git" "$target" || { fail "clone $name"; continue; }
  fi
  git -C "$target" fetch --quiet origin || fail "fetch $name"
  if [ -z "$(git -C "$target" status --porcelain)" ]; then
    git -C "$target" checkout --quiet "$branch" 2>/dev/null \
      || git -C "$target" checkout --quiet -b "$branch" "origin/$branch" || fail "$name branch $branch"
    git -C "$target" pull --quiet --ff-only || true
  fi
  echo "$name: $(git -C "$target" rev-parse --abbrev-ref HEAD) $(git -C "$target" rev-parse --short HEAD)"
done

step "Summary"
node --version; pnpm --version; "$CARGO_HOME/bin/rustc" --version 2>/dev/null; "$CARGO_HOME/bin/wasm-bindgen" --version 2>/dev/null
docker --version 2>/dev/null
if [ ${#failed[@]} -gt 0 ]; then
  printf 'Not ready: %s\n' "${failed[@]}"
  exit 1
fi
echo "Cloud session ready."
