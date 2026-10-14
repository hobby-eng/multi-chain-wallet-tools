import { afterEach, describe, expect, it, vi } from "vitest";

const changed = vi.hoisted(() => new Set());
vi.mock("node:fs", async (original) => {
  const actual = await original();
  return {
    ...actual,
    readFileSync(path, options) {
      const bytes = actual.readFileSync(path, options);
      if (!changed.has(String(path))) return bytes;
      // Change one input byte only in the reader; no live source file is edited.
      return typeof bytes === "string" ? `${bytes}\n` : Buffer.concat([bytes, Buffer.of(10)]);
    },
  };
});
import { resolve } from "node:path";
import { createWasmIntegrityManifest } from "./verify-wasm-integrity.mjs";

describe("canonical WASM source bindings", () => {
  afterEach(() => changed.clear());

  it.each([
    ".dockerignore",
    "tooling/toolchain-pins.json",
    "tooling/toolchain-pins.mjs",
    "tooling/verify-wasm-integrity.mjs",
    "tooling/verify-wasm-producers.mjs",
  ])("rejects an unchanged output record after %s changes", (input) => {
    const before = createWasmIntegrityManifest();
    changed.add(resolve(input));
    const after = createWasmIntegrityManifest();
    for (const [name, module] of Object.entries(before.modules)) {
      expect(after.modules[name].sourceSha256).not.toBe(module.sourceSha256);
      expect(after.modules[name].generated).toEqual(module.generated);
    }
  });
});
