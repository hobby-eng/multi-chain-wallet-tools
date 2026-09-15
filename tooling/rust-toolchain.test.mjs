import { describe, expect, it } from 'vitest';
import { assertExactToolVersion, resolveRustToolchain } from './rust-toolchain.mjs';

describe('Rust toolchain resolution', () => {
  it('uses the caller Cargo installation when repository-managed tools are absent', () => {
    const existing = new Set(['/ci/cargo/bin/cargo', '/ci/cargo/bin/wasm-bindgen']);
    const result = resolveRustToolchain('/workspace', { CARGO_HOME: '/ci/cargo', RUSTUP_HOME: '/ci/rustup' }, (path) =>
      existing.has(path),
    );
    expect(result.cargo).toBe('/ci/cargo/bin/cargo');
    expect(result.wasmBindgen).toBe('/ci/cargo/bin/wasm-bindgen');
    expect(result.environment.CARGO_HOME).toBe('/ci/cargo');
    expect(result.environment.CARGO_ENCODED_RUSTFLAGS).toContain('--remap-path-prefix=/workspace=/workspace');
  });

  it('falls back to commands on PATH when no absolute executable exists', () => {
    const result = resolveRustToolchain('/workspace', {}, () => false);
    expect(result.cargo).toBe('cargo');
    expect(result.wasmBindgen).toBe('wasm-bindgen');
    expect(result.environment).not.toHaveProperty('CARGO_HOME');
  });

  it('requires the exact crates.io CLI version string', () => {
    const canonical = () => ({ status: 0, stdout: 'wasm-bindgen 0.2.128\n' });
    expect(() => assertExactToolVersion('wasm-bindgen', 'wasm-bindgen 0.2.128', {}, canonical)).not.toThrow();

    const sourceBuild = () => ({ status: 0, stdout: 'wasm-bindgen 0.2.128 (92201b377)\n' });
    expect(() => assertExactToolVersion('wasm-bindgen', 'wasm-bindgen 0.2.128', {}, sourceBuild)).toThrow(
      /Expected exactly wasm-bindgen 0\.2\.128/u,
    );
  });
});
