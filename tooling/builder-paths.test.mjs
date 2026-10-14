import { describe, expect, it } from "vitest";
import {
  assertEmbeddedWasmWithoutBuilderPaths,
  assertNoBuilderPaths,
  builderPathsIn,
} from "./builder-paths.mjs";

/** A WebAssembly header followed by bytes that stand for a panic location. */
function module(text) {
  return Buffer.concat([Buffer.from("\0asm\x01\0\0\0", "latin1"), Buffer.from(text, "latin1")]);
}

describe("builder paths in WebAssembly (AUD-023-BLD003)", () => {
  it("finds home and root directories of every system, and passes remapped paths", () => {
    expect(builderPathsIn(module("\0/home/alice/cargo/registry/src/point.rs\0"))).toEqual([
      "/home/alice/cargo/registry/src/point.rs",
    ]);
    expect(builderPathsIn(module("/Users/bob/src/lib.rs\0"))).toHaveLength(1);
    expect(builderPathsIn(module("/root/.cargo/x.rs\0"))).toHaveLength(1);
    expect(builderPathsIn(module("C:\\Users\\carol\\src\\lib.rs\0"))).toHaveLength(1);
    expect(builderPathsIn(module("/rustc/0123abcd/library/core/src/panicking.rs\0"))).toEqual([]);
    expect(builderPathsIn(module("/cargo/registry/src/sec1-0.8.1/src/point.rs\0"))).toEqual([]);
  });

  it("refuses a module with one, naming it", () => {
    expect(() => assertNoBuilderPaths(module("/home/alice/x.rs"), "mhfe.wasm")).toThrow(
      /mhfe\.wasm holds 1 absolute builder path\(s\), for example \/home\/alice\/x\.rs/u,
    );
    expect(() => assertNoBuilderPaths(module("/rustc/abc/lib.rs"), "clean.wasm")).not.toThrow();
  });

  it("decodes the modules a page embeds as base64", () => {
    const leaking = module(`${"\0".repeat(16)}/home/alice/src/lib.rs`).toString("base64");
    const clean = module(`${"\0".repeat(16)}/rustc/abc/lib.rs`).toString("base64");
    expect(() =>
      assertEmbeddedWasmWithoutBuilderPaths(`<script>const a="${leaking}";</script>`, "page.html"),
    ).toThrow(/page\.html: embedded WebAssembly module 1 holds 1 absolute builder path/u);
    expect(
      assertEmbeddedWasmWithoutBuilderPaths(`<script>const a="${clean}";</script>`, "page.html"),
    ).toBe(1);
  });
});
