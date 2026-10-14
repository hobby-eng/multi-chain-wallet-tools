import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { MNEMOCODE_REPOSITORY } from "./sync-mnemocode-source.mjs";
import {
  assertReleasedUpstreams,
  GITHUB_SOURCES,
  LOCAL_IMPLEMENTATIONS,
  verifyCargoLock,
  verifyDependencyProvenance,
  verifyMhfePackage,
  verifyPnpmLock,
} from "./verify-dependency-provenance.mjs";
import { VendoredMhfePackage } from "./vendored-mhfe-package.mjs";

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

  it("asks GitHub only for each pinned public commit", async () => {
    const root = fixtureRoot();
    const fetchImpl = vi.fn(async (url) => ({
      ok: true,
      json: async () => ({ sha: url.split("/").at(-1) }),
    }));
    // The committed MnemoCode or MHFE pin may be unreleased, which CI=true refuses.
    vi.stubEnv("CI", "");
    try {
      const report = await verifyDependencyProvenance({
        root,
        writeReport: false,
        verifyFixedSources: false,
        fetchImpl,
        logger: { log: vi.fn(), warn: vi.fn() },
      });
      expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual(
        GITHUB_SOURCES.map(
          (source) => `https://api.github.com/repos/${source.repository}/commits/${source.commit}`,
        ),
      );
      // Read-only requests: nothing about the build or its inputs is sent.
      for (const [, init] of fetchImpl.mock.calls) {
        expect(init?.body).toBeUndefined();
        expect(init?.method ?? "GET").toBe("GET");
      }
      const mnemocode = GITHUB_SOURCES.find((source) => source.id === "mnemocode-core");
      expect(mnemocode?.repository).toBe(MNEMOCODE_REPOSITORY);
      expect(report.github.every((entry) => entry.status === "verified")).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
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

  it("warns, and does not fail, when GitHub answers with an HTTP error", async () => {
    const root = fixtureRoot();
    const warn = vi.fn();
    // As above: an unreleased pin is refused under CI=true before the report is returned.
    vi.stubEnv("CI", "");
    try {
      const report = await verifyDependencyProvenance({
        root,
        writeReport: false,
        verifyFixedSources: false,
        // For example a pinned commit that is not pushed yet, or GitHub's rate limit.
        fetchImpl: vi.fn(async () => ({
          ok: false,
          status: 404,
          json: async () => ({ message: "No commit found for SHA" }),
        })),
        logger: { log: vi.fn(), warn },
      });
      for (const entry of report.github) {
        expect(entry.status, entry.id).toBe("unavailable");
        expect(entry.detail, entry.id).toBe("GitHub returned HTTP 404");
      }
      const unavailable = warn.mock.calls.filter(([message]) =>
        message.includes("verification was unavailable"),
      );
      expect(unavailable).toHaveLength(report.github.length);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("permits an unavailable upstream with an explicit warning for every source", async () => {
    const root = fixtureRoot();
    const warn = vi.fn();
    // As above: an unreleased pin is refused under CI=true before the report is returned.
    vi.stubEnv("CI", "");
    try {
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
      // One warning per source; the warnings about unreleased upstreams are counted apart.
      const unavailable = warn.mock.calls.filter(([message]) =>
        message.includes("verification was unavailable"),
      );
      expect(unavailable).toHaveLength(report.github.length);
    } finally {
      vi.unstubAllEnvs();
    }
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

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

/** A vendored MHFE package of two files, its manifest, and the manifest's pin. */
function mhfeFixture() {
  const root = mkdtempSync(join(tmpdir(), "ckd-mhfe-package-"));
  const folder = join(root, "packages/recovery-mhfe-wasm/generated");
  const files = { "runtime/worker.js": "worker", "core/client.js": "client" };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(folder, path, ".."), { recursive: true });
    writeFileSync(join(folder, path), text);
  }
  const manifest = JSON.stringify({
    runtime: { files: { "worker.js": sha256(files["runtime/worker.js"]) } },
    modules: { core: { files: { "client.js": sha256(files["core/client.js"]) } } },
  });
  writeFileSync(join(folder, "modules.json"), manifest);
  return { root, folder, pin: sha256(manifest) };
}

describe("release gates that must refuse (AUD-023-BLD005)", () => {
  it("refuses an unreleased upstream in CI, and only warns elsewhere", () => {
    const sources = [{ id: "example", unreleased: "a local build" }];
    const logger = { warn: vi.fn() };
    expect(() => assertReleasedUpstreams(logger, sources, true)).toThrow(
      "Unreleased upstream sources cannot be built in CI: example.",
    );
    expect(() => assertReleasedUpstreams(logger, sources, false)).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/example is a local build\./u));
    expect(() => assertReleasedUpstreams(logger, [{ id: "released" }], true)).not.toThrow();
  });

  it("lists the MHFE package's nested files from its manifest, never its folders (AUD-024-BLD001)", () => {
    const { root, pin } = mhfeFixture();
    expect(new VendoredMhfePackage(root, pin).files()).toEqual([
      "packages/recovery-mhfe-wasm/generated/core/client.js",
      "packages/recovery-mhfe-wasm/generated/modules.json",
      "packages/recovery-mhfe-wasm/generated/runtime/worker.js",
    ]);
  });

  it("lists every file of the vendored MHFE package, both Argon2 builds, and not the launcher", () => {
    const files = new VendoredMhfePackage(process.cwd()).files();
    for (const path of [
      "core/argon2-mt.js",
      "core/argon2-st.js",
      "runtime/mhfe.wasm",
      "modules.json",
    ])
      expect(files).toContain(`packages/recovery-mhfe-wasm/generated/${path}`);
    expect(files.some((path) => path.endsWith("mhfe-fast-mode.py"))).toBe(false);
  });

  it("binds every vendored MHFE file to its manifest, and the manifest to its pin", () => {
    const { root, folder, pin } = mhfeFixture();
    expect(() => verifyMhfePackage(root, pin)).not.toThrow();
    expect(() => verifyMhfePackage(root, "0".repeat(64))).toThrow(
      /Pinned source checksum mismatch/u,
    );

    writeFileSync(join(folder, "core/client.js"), "changed");
    expect(() => verifyMhfePackage(root, pin)).toThrow(
      /MHFE package file core\/client\.js does not match modules\.json/u,
    );
    writeFileSync(join(folder, "core/client.js"), "client");

    writeFileSync(join(folder, "runtime/extra.js"), "extra");
    expect(() => verifyMhfePackage(root, pin)).toThrow(
      "The MHFE package holds files its manifest does not list: runtime/extra.js.",
    );
    rmSync(join(folder, "runtime/extra.js"));

    rmSync(join(folder, "runtime/worker.js"));
    expect(() => verifyMhfePackage(root, pin)).toThrow(/worker\.js/u);
  });
});
