import { verifyToolchainProjections } from "./toolchain-pins.mjs";
import { DockerStageGraph } from "./docker-stage-graph.mjs";
import { CANONICAL_WORKSPACE } from "./verify-wasm-integrity.mjs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), "utf8");
verifyToolchainProjections(root);
const dockerfile = read("Dockerfile.reproducible");
const shellWrapper = read("tooling/build-reproducible.sh");
const orchestrator = read("tooling/build-reproducible.mjs");
const manifest = JSON.parse(read("package.json"));
const nodeVersion = read(".node-version").trim();
const packageManager = manifest.packageManager;
const expectedNodeEngine = `>=${nodeVersion}`;
if (manifest.engines?.node !== expectedNodeEngine) {
  throw new Error(`package.json engines.node must be ${expectedNodeEngine}.`);
}
if (!/^pnpm@\d+\.\d+\.\d+$/u.test(packageManager ?? "")) {
  throw new Error("package.json packageManager must pin an exact pnpm version.");
}
if (!String(manifest.scripts.verify).includes("node tooling/verify-dependency-provenance.mjs")) {
  throw new Error("The canonical pnpm verify command must enforce dependency provenance.");
}

function requireMatch(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(message);
}

// The canonical WASM record writer recognizes the container by this checkout location.
if (!dockerfile.split("\n").includes(`WORKDIR ${CANONICAL_WORKSPACE}`))
  throw new Error(`Dockerfile.reproducible must build in WORKDIR ${CANONICAL_WORKSPACE}.`);

requireMatch(
  dockerfile,
  /^FROM buildpack-deps:noble@sha256:[a-f0-9]{64} AS toolchain$/m,
  "The canonical base image must be pinned by an immutable SHA-256 digest.",
);
for (const expected of [
  `ARG NODE_VERSION=${nodeVersion}`,
  "ARG NODE_ARCHIVE_SHA256=ca70e9e349de048b9522abb3adc05b3bd6f43c5ffd3ec57916c7da292f59f022",
  "ARG RUSTUP_VERSION=1.29.1",
  "ARG RUSTUP_INIT_SHA256=dda7234360b7f578ca8b0ddcb80145646fa61a67c1720a5abc7051b35c9fcb71",
  "ARG CLANG_VERSION=1:18.0-59~exp2",
  "ARG WASI_LIBC_VERSION=0.0~git20230113.4362b18-3",
  "CARGO_NET_GIT_FETCH_WITH_CLI=true",
  'apt-get install --yes --no-install-recommends \"clang=${CLANG_VERSION}\" \"wasi-libc=${WASI_LIBC_VERSION}\"',
  'CFLAGS_wasm32_unknown_unknown="-I/usr/include/wasm32-wasi -include /usr/include/wasm32-wasi/string.h"',
  "git config --system http.version HTTP/1.1",
  'npm install --global "${package_manager}"',
  'cargo install wasm-bindgen-cli --version "${bindgen_version}" --locked',
  "for attempt in 1 2 3 4 5",
  "Cargo fetch attempt ${attempt} failed",
  "ARG SOURCE_COMMIT=unavailable",
  "ARG SOURCE_DIRTY=false",
  "VERIFICATION_COMMIT=${SOURCE_COMMIT}",
  "VERIFICATION_DIRTY=${SOURCE_DIRTY}",
  "RUN --network=none pnpm verify",
  "RUN --network=none pnpm build:matrix:smoke",
  "node tooling/wasm-catalog.mjs fetch",
  "node tooling/wasm-catalog.mjs snapshot /tmp/committed-generated",
  "node tooling/wasm-catalog.mjs verify /tmp/committed-generated",
  "COPY --from=wasm-built /tmp/wasm-artifacts /generated",
  "FROM scratch AS artifacts",
  "FROM scratch AS wasm-artifacts",
]) {
  if (!dockerfile.includes(expected))
    throw new Error(`Missing canonical container assertion: ${expected}`);
}

const stages = new DockerStageGraph(dockerfile);
const wasmCommands = stages.runCommands("wasm-artifacts").join("\n");
if (/\bpnpm\s+(?:verify\b|build:matrix:smoke\b)/u.test(wasmCommands))
  throw new Error("WASM regeneration must not execute release verification or the build matrix.");
const releaseCommands = stages.runCommands("artifacts").join("\n");
for (const required of [
  "pnpm verify",
  "pnpm build:matrix:smoke",
  "verify /tmp/committed-generated",
])
  if (!releaseCommands.includes(required))
    throw new Error(`The release target lost its mandatory gate: ${required}`);

for (const expected of [
  'spawnSync("git", ["rev-parse", "HEAD"]',
  'spawnSync("git", ["status", "--porcelain"]',
  "`SOURCE_COMMIT=${sourceCommit}`",
  "`SOURCE_DIRTY=${String(sourceDirty)}`",
]) {
  if (!orchestrator.includes(expected)) {
    throw new Error(
      `The local reproducible-build wrapper is missing provenance binding: ${expected}`,
    );
  }
}

if (!shellWrapper.includes('exec node "$root/tooling/build-reproducible.mjs" "$@"'))
  throw new Error("The shell entry point must delegate to the catalog-based build orchestrator.");

for (const path of [
  ".github/workflows/ci.yml",
  ".github/workflows/full-wasm.yml",
  ".github/workflows/release.yml",
]) {
  const workflow = read(path);
  for (const expected of [
    "--platform linux/amd64",
    "--network host",
    "--file Dockerfile.reproducible",
    "--build-arg SOURCE_COMMIT=${GITHUB_SHA}",
    "--build-arg SOURCE_DIRTY=false",
    "--target artifacts",
  ]) {
    if (!workflow.includes(expected))
      throw new Error(`${path} does not use the canonical container setting: ${expected}`);
  }
}

for (const path of [".github/workflows/ci.yml", ".github/workflows/release.yml"]) {
  const workflow = read(path);
  for (const expected of [
    "playwright install --with-deps chromium firefox",
    "pnpm test:browser:files",
    "pnpm test:browser:regressions",
    "pnpm test:browser:selective",
  ]) {
    if (!workflow.includes(expected))
      throw new Error(`${path} is missing the browser release gate: ${expected}`);
  }
}

for (const path of [
  ".github/workflows/ci.yml",
  ".github/workflows/release.yml",
  ".github/workflows/vectors.yml",
]) {
  const workflow = read(path);
  if (!workflow.includes("node-version-file: .node-version")) {
    throw new Error(`${path} must read Node.js from .node-version.`);
  }
  if (/\n\s+version:\s+\d+\.\d+\.\d+\s*$/mu.test(workflow)) {
    throw new Error(`${path} must read pnpm from package.json packageManager.`);
  }
}
if (!read(".github/workflows/release.yml").includes("needs: browser")) {
  throw new Error("The release job must wait for the browser gate.");
}

const ignored = read(".dockerignore").split(/\r?\n/u);
for (const expected of [".git", "node_modules", ".pnpm-store", "dist", "**/target"]) {
  if (!ignored.includes(expected)) throw new Error(`.dockerignore must exclude ${expected}`);
}
if (ignored.includes(".github") || ignored.includes(".github/**")) {
  throw new Error(
    ".dockerignore must include the GitHub workflows verified inside the canonical container.",
  );
}

console.log("Canonical reproducible-container configuration verified.");
