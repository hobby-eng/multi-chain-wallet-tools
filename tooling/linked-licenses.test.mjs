import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import {
  assertLinkedLicenseLocks,
  LINKED_LICENSE_PRODUCTS,
  licensesNotTaken,
  RUST_LIBRARY_NOTICE,
  takenLicense,
} from "./linked-licenses.mjs";

let directory;
afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

/**
 * A synthetic project root with every product's Cargo.lock and, where given, its license file, and
 * the pinned Rust's library notice unless `withoutNotice`.
 */
function project(written, { withoutNotice = false } = {}) {
  directory = mkdtempSync(join(tmpdir(), "synthetic-linked-licenses-"));
  if (!withoutNotice) {
    mkdirSync(dirname(join(directory, RUST_LIBRARY_NOTICE)), { recursive: true });
    writeFileSync(join(directory, RUST_LIBRARY_NOTICE), "<p>Synthetic library notice</p>\n");
  }
  for (const product of LINKED_LICENSE_PRODUCTS) {
    const lock = `# Synthetic lock of ${product.id}\n`;
    mkdirSync(join(directory, product.crate), { recursive: true });
    writeFileSync(join(directory, product.crate, "Cargo.lock"), lock);
    const hash = written(product, createHash("sha256").update(lock).digest("hex"));
    if (hash === undefined) continue;
    mkdirSync(dirname(join(directory, product.output)), { recursive: true });
    writeFileSync(join(directory, product.output), `Header\nCargo.lock SHA-256: ${hash}\n`);
  }
  return directory;
}

describe("licenses of the linked Rust crates", () => {
  it("takes MIT where it is one of the licenses offered, and nothing else", () => {
    expect(takenLicense("MIT OR Apache-2.0")).toBe("MIT");
    expect(takenLicense("MIT/Apache-2.0")).toBe("MIT");
    expect(takenLicense("Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT")).toBe("MIT");
    expect(takenLicense("(MIT OR Apache-2.0) AND Unicode-3.0")).toBe("MIT AND Unicode-3.0");
    expect(takenLicense("BSD-3-Clause")).toBe("BSD-3-Clause");
    expect(takenLicense("MIT")).toBe("MIT");
    expect(licensesNotTaken("MIT OR Apache-2.0")).toEqual(["Apache-2.0"]);
    expect(licensesNotTaken("MIT")).toEqual([]);
    expect(licensesNotTaken("Apache-2.0 OR BSL-1.0")).toEqual([]);
  });

  it("accepts files written from the Cargo.lock that each product has", () => {
    const root = project((_, hash) => hash);
    expect(() => assertLinkedLicenseLocks({ root })).not.toThrow();
  });

  it("refuses a file written from another lock, or none at all", () => {
    for (const stale of [
      (product, hash) => (product.id === "dash-shielded-wasm" ? "0".repeat(64) : hash),
      (product, hash) => (product.id === "key-derivation-launcher" ? undefined : hash),
    ]) {
      const root = project(stale);
      expect(() => assertLinkedLicenseLocks({ root })).toThrow(
        expect.objectContaining({ code: "linked-licenses.stale" }),
      );
      rmSync(root, { recursive: true, force: true });
      directory = undefined;
    }
  });

  it("refuses a tree without the library notice of the pinned Rust", () => {
    const root = project((_, hash) => hash, { withoutNotice: true });
    expect(() => assertLinkedLicenseLocks({ root })).toThrow(/library notice of the pinned Rust/u);
  });

  it("finds every committed file written from the Cargo.lock beside it", () => {
    expect(() => assertLinkedLicenseLocks()).not.toThrow();
  });
});
