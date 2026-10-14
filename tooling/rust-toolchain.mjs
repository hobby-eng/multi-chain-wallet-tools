import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { TOOLCHAIN_PINS } from "./toolchain-pins.mjs";

/**
 * Prefer the repository-managed Rust tools, then fall back to the caller's
 * Cargo installation. CI and container builds intentionally omit .tools, so
 * an unconditional local path would make builds depend on one machine.
 */
export function resolveRustToolchain(root, environment = process.env, pathExists = existsSync) {
  const candidates = [
    resolve(root, "..", "workingspace"),
    resolve(root, ".tools"),
    resolve(root, "..", ".tools"),
  ];
  const managedTools = candidates.find((directory) =>
    pathExists(resolve(directory, "cargo/bin/cargo")),
  );
  const cargoHome =
    environment.CARGO_HOME ?? (managedTools ? resolve(managedTools, "cargo") : undefined);
  const rustupHome =
    environment.RUSTUP_HOME ?? (managedTools ? resolve(managedTools, "rustup") : undefined);
  const cargoPath = cargoHome === undefined ? undefined : resolve(cargoHome, "bin/cargo");
  const wasmBindgenPath =
    cargoHome === undefined ? undefined : resolve(cargoHome, "bin/wasm-bindgen");

  return Object.freeze({
    cargo: cargoPath !== undefined && pathExists(cargoPath) ? cargoPath : "cargo",
    wasmBindgen:
      wasmBindgenPath !== undefined && pathExists(wasmBindgenPath)
        ? wasmBindgenPath
        : "wasm-bindgen",
    cargoHome,
    rustupHome,
    environment: {
      ...environment,
      RUSTUP_TOOLCHAIN: environment.RUSTUP_TOOLCHAIN ?? TOOLCHAIN_PINS.rust,
      ...(cargoHome === undefined ? {} : { CARGO_HOME: cargoHome }),
      ...(rustupHome === undefined ? {} : { RUSTUP_HOME: rustupHome }),
      CARGO_ENCODED_RUSTFLAGS: [
        ...(cargoHome === undefined ? [] : [`--remap-path-prefix=${cargoHome}=/cargo`]),
        ...(rustupHome === undefined ? [] : [`--remap-path-prefix=${rustupHome}=/rustup`]),
        `--remap-path-prefix=${root}=/workspace`,
      ].join("\u001f"),
    },
  });
}

/** Reject a source-built CLI that reports the pinned release plus Git metadata. */
export function assertExactToolVersion(command, expected, options = {}, run = spawnSync) {
  assertToolVersion(command, expected, options, run, false);
}

/** Official Cargo builds include a commit/date suffix; their release identifier is still exact. */
export function assertRustToolVersion(command, options = {}, run = spawnSync) {
  assertToolVersion(command, `cargo ${TOOLCHAIN_PINS.rust}`, options, run, true);
}

function assertToolVersion(command, expected, options, run, buildMetadata) {
  const result = run(command, ["--version"], { ...options, encoding: "utf8" });
  if (result.error !== undefined) throw result.error;
  const actual = result.stdout.trim();
  const matches =
    actual === expected ||
    (buildMetadata && actual.startsWith(`${expected} (`) && actual.endsWith(")"));
  if (result.status !== 0 || !matches) {
    throw new Error(`Expected exactly ${expected}; received ${actual || "no version output"}.`);
  }
}
