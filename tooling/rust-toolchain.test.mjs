import { describe, expect, it } from "vitest";
import {
  assertExactToolVersion,
  assertRustToolVersion,
  resolveRustToolchain,
} from "./rust-toolchain.mjs";
import { TOOLCHAIN_PINS } from "./toolchain-pins.mjs";

describe("Rust toolchain resolution", () => {
  it("uses the caller Cargo installation when repository-managed tools are absent", () => {
    const existing = new Set(["/ci/cargo/bin/cargo", "/ci/cargo/bin/wasm-bindgen"]);
    const result = resolveRustToolchain(
      "/workspace",
      { CARGO_HOME: "/ci/cargo", RUSTUP_HOME: "/ci/rustup" },
      (path) => existing.has(path),
    );
    expect(result.cargo).toBe("/ci/cargo/bin/cargo");
    expect(result.wasmBindgen).toBe("/ci/cargo/bin/wasm-bindgen");
    expect(result.environment.CARGO_HOME).toBe("/ci/cargo");
    expect(result.environment.CARGO_ENCODED_RUSTFLAGS).toContain(
      "--remap-path-prefix=/workspace=/workspace",
    );
  });

  it("falls back to commands on PATH when no absolute executable exists", () => {
    const result = resolveRustToolchain("/workspace", {}, () => false);
    expect(result.cargo).toBe("cargo");
    expect(result.wasmBindgen).toBe("wasm-bindgen");
    expect(result.environment).not.toHaveProperty("CARGO_HOME");
  });

  it("requires the exact crates.io CLI version string", () => {
    const canonical = () => ({ status: 0, stdout: "wasm-bindgen 0.2.129\n" });
    expect(() =>
      assertExactToolVersion("wasm-bindgen", "wasm-bindgen 0.2.129", {}, canonical),
    ).not.toThrow();

    const sourceBuild = () => ({ status: 0, stdout: "wasm-bindgen 0.2.129 (92201b377)\n" });
    expect(() =>
      assertExactToolVersion("wasm-bindgen", "wasm-bindgen 0.2.129", {}, sourceBuild),
    ).toThrow(/Expected exactly wasm-bindgen 0\.2\.129/u);
  });

  it("admits Cargo release metadata while refusing another release and subprocess failures", () => {
    const version = `cargo ${TOOLCHAIN_PINS.rust}`;
    for (const stdout of [version, `${version} (a12345678 2026-10-01)`])
      expect(() => assertRustToolVersion("cargo", {}, () => ({ status: 0, stdout }))).not.toThrow();
    for (const stdout of ["cargo 0.0.0", `${version}-beta`, `${version} extra`])
      expect(() => assertRustToolVersion("cargo", {}, () => ({ status: 0, stdout }))).toThrow(
        /Expected exactly/u,
      );
    expect(() =>
      assertRustToolVersion("cargo", {}, () => ({ status: 1, stdout: version })),
    ).toThrow();
    expect(() =>
      assertRustToolVersion("cargo", {}, () => ({ error: new Error("synthetic spawn failure") })),
    ).toThrow("synthetic spawn failure");
  });
});
