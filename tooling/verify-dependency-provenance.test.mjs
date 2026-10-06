import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  LOCAL_IMPLEMENTATIONS,
  verifyCargoLock,
  verifyDependencyProvenance,
  verifyPnpmLock,
} from "./verify-dependency-provenance.mjs";

describe("dependency provenance verifier", () => {
  it("requires package-manager hashes and full git commits", () => {
    expect(
      verifyPnpmLock(
        "lockfileVersion: '9.0'\npackages:\n  example@1.0.0:\n    resolution: {integrity: sha512-YWJjZA==}\nsnapshots:\n",
      ),
    ).toBe(1);
    expect(() =>
      verifyPnpmLock(
        "lockfileVersion: '9.0'\npackages:\n  example@1.0.0:\n    resolution: {}\nsnapshots:\n",
      ),
    ).toThrow(/SHA-512/u);
    expect(
      verifyCargoLock(
        '[[package]]\nname = "registry"\nversion = "1.0.0"\nsource = "registry+x"\nchecksum = "' +
          "a".repeat(64) +
          '"\n\n[[package]]\nname = "git"\nversion = "1.0.0"\nsource = "git+https://example.invalid/repo#' +
          "b".repeat(40) +
          '"\n',
        "fixture",
      ),
    ).toBe(2);
    expect(() =>
      verifyCargoLock(
        '[[package]]\nname = "git"\nversion = "1.0.0"\nsource = "git+https://example.invalid/repo#abc"\n',
        "fixture",
      ),
    ).toThrow(/full commit/u);
  });

  it("fails on an available upstream with a different commit", async () => {
    const root = fixtureRoot();
    await expect(
      verifyDependencyProvenance({
        root,
        writeReport: false,
        verifyFixedSources: false,
        fetchImpl: vi.fn(async () => ({ ok: true, json: async () => ({ sha: "0".repeat(40) }) })),
        logger: { log: vi.fn(), warn: vi.fn() },
      }),
    ).rejects.toThrow(/provenance mismatch/u);
  });

  it("permits an unavailable upstream with an explicit warning for every source", async () => {
    const root = fixtureRoot();
    const warn = vi.fn();
    const report = await verifyDependencyProvenance({
      root,
      writeReport: false,
      verifyFixedSources: false,
      fetchImpl: vi.fn(async () => {
        throw new Error("offline");
      }),
      logger: { log: vi.fn(), warn },
    });
    expect(report.github.every((entry) => entry.status === "unavailable")).toBe(true);
    expect(warn).toHaveBeenCalledTimes(report.github.length);
  });
});

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), "ckd-provenance-"));
  writeFileSync(
    join(root, "pnpm-lock.yaml"),
    "lockfileVersion: '9.0'\npackages:\n  example@1.0.0:\n    resolution: {integrity: sha512-YWJjZA==}\nsnapshots:\n",
  );
  for (const path of [
    "packages/dash-shielded-wasm/rust/Cargo.lock",
    "packages/recovery-codex32-wasm/rust/Cargo.lock",
    "packages/recovery-sskr-wasm/rust/Cargo.lock",
    "packages/recovery-envelope-wasm/rust/Cargo.lock",
    "apps/key-derivation/launcher/Cargo.lock",
  ]) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(
      join(root, path),
      '[[package]]\nname = "registry"\nversion = "1.0.0"\nsource = "registry+x"\nchecksum = "' +
        "a".repeat(64) +
        '"\n',
    );
  }
  // Every file the verifier hashes, taken from its own list so that the fixture never drifts.
  const sourceFiles = LOCAL_IMPLEMENTATIONS.flatMap((entry) => entry.files);
  for (const path of sourceFiles) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), path);
  }
  return root;
}
