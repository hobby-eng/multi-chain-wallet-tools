import { BUILD_PROFILES } from "./build-profiles.mjs";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { WASM_MODULES } from "./wasm-modules.mjs";
import { DockerBuildLimits } from "./docker-build-limits.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
if (process.argv.slice(2).some((argument) => argument !== "--wasm"))
  throw new Error("Usage: build-reproducible.mjs [--wasm]");
const wasmOnly = process.argv.includes("--wasm");
const target = wasmOnly ? "wasm-artifacts" : "artifacts";
const image = `multi-chain-wallet-tools-reproducible:${String(manifest.version)}-${target}`;
let sourceCommit = "unavailable";
// An archive without readable Git metadata must never be described as a clean checkout.
let sourceDirty = true;
try {
  const commit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
  const status = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
  if (commit.error === undefined && commit.status === 0)
    sourceCommit = commit.stdout.trim() || "unavailable";
  if (status.error === undefined && status.status === 0) sourceDirty = status.stdout.trim() !== "";
} catch {}
const temporary = mkdtempSync(join(tmpdir(), "multi-chain-wallet-tools-reproducible-"));
let container;

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error !== undefined) {
    if (command === "docker" && result.error.code === "ENOENT") {
      throw new Error(
        "Docker was not found. Install Docker Engine or Docker Desktop and ensure the docker command is on PATH.",
      );
    }
    throw result.error;
  }
  if (result.status !== 0)
    throw Object.assign(
      new Error(`${command} ${args[0]} failed (exit ${result.status ?? "signal"}).`),
      {
        exitCode: result.status ?? 1,
      },
    );
}

try {
  run("docker", ["version"]);
  run("docker", [
    "build",
    "--load",
    ...new DockerBuildLimits().arguments(),
    "--platform",
    "linux/amd64",
    "--network",
    "host",
    "--file",
    "Dockerfile.reproducible",
    "--build-arg",
    `SOURCE_COMMIT=${sourceCommit}`,
    "--build-arg",
    `SOURCE_DIRTY=${String(sourceDirty)}`,
    "--target",
    target,
    "--tag",
    image,
    ".",
  ]);
  const containerIdFile = resolve(temporary, "container-id");
  run("docker", ["create", "--cidfile", containerIdFile, image, "/bin/true"]);
  container = readFileSync(containerIdFile, "utf8").trim();
  if (container.length === 0) throw new Error("Docker did not record the temporary container ID.");
  const source = wasmOnly ? "/generated/." : "/dist/.";
  // Container bookkeeping belongs to the temporary root, never to the exported artifact tree.
  const exported = resolve(temporary, "output");
  mkdirSync(exported);
  run("docker", ["cp", `${container}:${source}`, exported]);

  if (wasmOnly) {
    if (
      WASM_MODULES.some(
        (module) =>
          !existsSync(resolve(exported, module.archiveDirectory, `${module.stem}_bg.wasm`)),
      ) ||
      !existsSync(resolve(exported, "wasm-canonical-manifest.json"))
    ) {
      throw new Error("The reproducible WASM image did not contain the expected generated module.");
    }
    for (const module of WASM_MODULES) {
      const destination = resolve(root, "packages", module.packageDirectory, "generated");
      rmSync(destination, { recursive: true, force: true });
      cpSync(resolve(exported, module.archiveDirectory), destination, { recursive: true });
    }
    cpSync(
      resolve(exported, "wasm-canonical-manifest.json"),
      resolve(root, "tooling/wasm-canonical-manifest.json"),
    );
    console.log("Replaced the committed generated WASM inputs with the canonical container build.");
  } else {
    const destination = resolve(root, "dist");
    const manifests = Object.values(BUILD_PROFILES).map(
      (profile) => `${profile.outputDirectory}/release/SHA256SUMS`,
    );
    if (manifests.some((path) => !existsSync(resolve(exported, path)))) {
      throw new Error("The reproducible build did not contain the verified release bundle.");
    }
    rmSync(destination, { recursive: true, force: true });
    cpSync(exported, destination, { recursive: true });
    for (const path of manifests)
      console.log(readFileSync(resolve(destination, path), "utf8").trim());
    console.log("Copied the canonical container build to dist/.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = error?.exitCode ?? 1;
} finally {
  if (container !== undefined && container.length > 0) {
    spawnSync("docker", ["rm", "--force", container], { cwd: root, stdio: "ignore" });
  }
  rmSync(temporary, { recursive: true, force: true });
}
