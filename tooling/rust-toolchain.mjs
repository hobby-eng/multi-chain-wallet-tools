import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * Prefer the repository-managed Rust tools, then fall back to the caller's
 * Cargo installation. CI and container builds intentionally omit .tools, so
 * an unconditional local path would make builds depend on one machine.
 */
export function resolveRustToolchain(root, environment = process.env, pathExists = existsSync) {
  const candidates = [resolve(root, '.tools'), resolve(root, '..', '.tools')];
  const managedTools = candidates.find((directory) => pathExists(resolve(directory, 'cargo/bin/cargo')));
  const fallbackHome = environment.HOME;
  const cargoHome = managedTools
    ? resolve(managedTools, 'cargo')
    : (environment.CARGO_HOME ?? (fallbackHome === undefined ? undefined : resolve(fallbackHome, '.cargo')));
  const rustupHome = managedTools
    ? resolve(managedTools, 'rustup')
    : (environment.RUSTUP_HOME ?? (fallbackHome === undefined ? undefined : resolve(fallbackHome, '.rustup')));
  const cargoPath = cargoHome === undefined ? undefined : resolve(cargoHome, 'bin/cargo');
  const wasmBindgenPath = cargoHome === undefined ? undefined : resolve(cargoHome, 'bin/wasm-bindgen');

  return Object.freeze({
    cargo: cargoPath !== undefined && pathExists(cargoPath) ? cargoPath : 'cargo',
    wasmBindgen: wasmBindgenPath !== undefined && pathExists(wasmBindgenPath) ? wasmBindgenPath : 'wasm-bindgen',
    cargoHome,
    rustupHome,
    environment: {
      ...environment,
      ...(cargoHome === undefined ? {} : { CARGO_HOME: cargoHome }),
      ...(rustupHome === undefined ? {} : { RUSTUP_HOME: rustupHome }),
      CARGO_ENCODED_RUSTFLAGS: [
        ...(cargoHome === undefined ? [] : [`--remap-path-prefix=${cargoHome}=/cargo`]),
        ...(rustupHome === undefined ? [] : [`--remap-path-prefix=${rustupHome}=/rustup`]),
        `--remap-path-prefix=${root}=/workspace`,
      ].join('\u001f'),
    },
  });
}

/** Reject a source-built CLI that reports the pinned release plus Git metadata. */
export function assertExactToolVersion(command, expected, options = {}, run = spawnSync) {
  const result = run(command, ['--version'], { ...options, encoding: 'utf8' });
  if (result.error !== undefined) throw result.error;
  const actual = result.stdout.trim();
  if (result.status !== 0 || actual !== expected) {
    throw new Error(`Expected exactly ${expected}; received ${actual || 'no version output'}.`);
  }
}
