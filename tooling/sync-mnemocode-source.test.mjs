import { readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  applyKeyDerivationFeatureTemplate,
  vendoredMnemoCodeVersion,
} from "./key-derivation-features.mjs";
import {
  MNEMOCODE_FILES,
  MNEMOCODE_MANIFEST,
  MNEMOCODE_SOURCE_DIRECTORY,
  SHARED_DEPENDENCIES,
  assertAllowedImports,
  assertCommitOnMain,
  referencedCommits,
  importedSpecifiers,
  selectReleaseTag,
  verifyMnemoCodeSource,
} from "./sync-mnemocode-source.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const commit = (digit) => digit.repeat(40);

describe("MnemoCode core vendoring", () => {
  it("prefers the highest release tag and ignores pre-release or malformed tags", () => {
    const listing = [
      `${commit("a")}\trefs/tags/v0.1.0`,
      `${commit("b")}\trefs/tags/v0.10.0`,
      `${commit("c")}\trefs/tags/v0.2.9`,
      `${commit("d")}\trefs/tags/v1.0.0-rc.1`,
      `${commit("e")}\trefs/tags/nightly`,
    ].join("\n");
    expect(selectReleaseTag(listing)).toMatchObject({ reference: "v0.10.0", commit: commit("b") });
    expect(selectReleaseTag(`${commit("d")}\trefs/tags/v1.0.0-rc.1`)).toBeUndefined();
    expect(selectReleaseTag("")).toBeUndefined();
  });

  it("takes the commit behind an annotated tag, not the tag itself", () => {
    const listing = [
      `${commit("1")}\trefs/tags/v0.2.0`,
      `${commit("2")}\trefs/tags/v0.2.0^{}`,
      `${commit("3")}\trefs/tags/v0.1.0`,
      `${commit("4")}\trefs/heads/main`,
    ].join("\n");
    expect(referencedCommits(listing).get("refs/tags/v0.2.0")).toBe(commit("2"));
    expect(referencedCommits(listing).get("refs/tags/v0.1.0")).toBe(commit("3"));
    expect(selectReleaseTag(listing)).toMatchObject({ reference: "v0.2.0", commit: commit("2") });
  });

  it("accepts a full commit only when the main branch contains it", async () => {
    const answer =
      (status, ok = true) =>
      async () => ({ ok, status: ok ? 200 : 404, json: async () => ({ status }) });
    await expect(assertCommitOnMain(commit("a"), answer("ahead"))).resolves.toBeUndefined();
    await expect(assertCommitOnMain(commit("a"), answer("identical"))).resolves.toBeUndefined();
    // A commit that exists only in a fork has diverged from main.
    await expect(assertCommitOnMain(commit("a"), answer("diverged"))).rejects.toThrow(
      "not part of the main branch",
    );
    await expect(assertCommitOnMain(commit("a"), answer("behind"))).rejects.toThrow(
      "not part of the main branch",
    );
    await expect(assertCommitOnMain(commit("a"), answer("", false))).rejects.toThrow("HTTP 404");
  });

  it("allows only the shared packages and files inside the vendored set", () => {
    expect(() =>
      assertAllowedImports(
        "export/render.ts",
        "import { PDFDocument } from 'pdf-lib';\nimport fontkit from '@pdf-lib/fontkit';\n",
      ),
    ).not.toThrow();
    expect(() =>
      assertAllowedImports(
        "core/words.ts",
        "import { validateMnemonic } from '@scure/bip39';\nimport { x } from './types.js';\n",
      ),
    ).not.toThrow();
    for (const specifier of [
      "node:fs",
      "qrcode",
      "pngjs",
      "node:crypto",
      // A package outside the shared set; @scure/bip32 is shared since wallet checks need it.
      "@scure/bip32/extra.js",
      "../sskr/shares.js",
      "../../vendor/x.js",
    ]) {
      expect(() =>
        assertAllowedImports("core/words.ts", `import { x } from '${specifier}';\n`),
      ).toThrow();
    }
    expect(() =>
      assertAllowedImports("core.ts", "export { x } from './core/missing.js';\n"),
    ).toThrow(/outside/u);
    expect(() =>
      assertAllowedImports("core.ts", "const x = await import('node:crypto');\n"),
    ).toThrow();
    expect(importedSpecifiers("import type { A } from './a.js';\nexport * from './b.js';")).toEqual(
      ["./a.js", "./b.js"],
    );
  });

  it("matches the committed manifest, file set and shared dependency version", () => {
    const manifest = verifyMnemoCodeSource({ root });
    expect(manifest.commit).toMatch(/^[0-9a-f]{40}$/u);
    expect(Object.keys(manifest.files).sort()).toEqual(Object.values(MNEMOCODE_FILES).sort());
    const project = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
    for (const name of SHARED_DEPENDENCIES)
      expect(manifest.sharedDependencies[name], name).toBe(project.dependencies[name]);
  });

  it("names every shared package and the provenance request in the source guide", () => {
    const guide = readFileSync(resolve(root, "docs/MNEMOCODE_SOURCE.md"), "utf8");
    for (const name of SHARED_DEPENDENCIES) expect(guide, name).toContain(`\`${name}\``);
    // Builds ask GitHub whether the pinned commit exists; the guide must not deny it.
    expect(guide).toContain("api.github.com");
    expect(guide).toContain("`pnpm verify:provenance`");
    expect(guide).not.toMatch(/never contact GitHub/u);
  });

  it("lists the vendored files the Discovery Scanner compiles, and their own gate, in the guide", () => {
    const { files, packages } = vendoredFilesReachedFrom(
      resolve(root, "apps/discovery-scanner/src"),
    );
    expect(files).toEqual([
      "core/bip39-sizes.ts",
      "core/bits.ts",
      "core/candidate-encryption-self-test.ts",
      "core/candidate-encryption.ts",
      "core/candidate-file-admission.ts",
      "core/candidate-file-refusal.ts",
      "core/candidate-list-self-test.ts",
      "core/candidate-list.ts",
      "core/english-words.ts",
      "core/pieces.ts",
      "core/places.ts",
      "core/redacted.ts",
      "core/refusal.ts",
      "core/search-plan.ts",
      "core/search-turns.ts",
      "core/self-test-check.ts",
      "core/typed-number.ts",
      "core/white-space.ts",
      "sskr/checksum.ts",
    ]);
    expect(packages).toEqual([
      "@scure/base",
      "@scure/bip39",
      "@scure/bip39/wordlists/english.js",
      "age-encryption",
    ]);
    const guide = readFileSync(resolve(root, "docs/MNEMOCODE_SOURCE.md"), "utf8");
    for (const path of files) expect(guide, path).toContain(`\`${path}\``);
    // The Scanner is its own page: the Deriver's feature switch must not be named as its gate.
    expect(guide).toContain("`--exclude mnemocode` does not remove it");
    expect(guide).toContain('`featureMarkers["seed-discovery"]`');
    const composition = readFileSync(resolve(root, "tooling/discovery-composition.mjs"), "utf8");
    const seedMarkers = composition.match(/"seed-discovery": \[([^\]]*)\]/u)?.[1] ?? "";
    for (const marker of [
      "/recovery-mnemocode/source/core/candidate-encryption.ts",
      "/node_modules/age-encryption/",
    ])
      expect(seedMarkers, marker).toContain(`"${marker}"`);
  });

  it("keeps the Bitcoin-only packages in wallet evidence, as the source guide says", () => {
    const base = resolve(root, MNEMOCODE_SOURCE_DIRECTORY);
    // Coin addresses need secp256k1 for every coin, Dash included; only btc-signer is Bitcoin's.
    const bitcoinOnly = /^@scure\/btc-signer/u;
    const users = Object.values(MNEMOCODE_FILES)
      .filter((path) => path.endsWith(".ts"))
      .filter((path) =>
        importedSpecifiers(readFileSync(resolve(base, path), "utf8")).some((specifier) =>
          bitcoinOnly.test(specifier),
        ),
      );
    expect(users).toEqual(["core/wallet-evidence.ts"]);
    // Builds without Bitcoin leave that module out; the guide names the gate that enforces it.
    const guide = readFileSync(resolve(root, "docs/MNEMOCODE_SOURCE.md"), "utf8");
    for (const name of ["core/wallet-evidence.ts", "core/master-fingerprint.ts", "`sskr`"])
      expect(guide, name).toContain(name);
    const composition = readFileSync(
      resolve(root, "tooling/key-derivation-composition.mjs"),
      "utf8",
    );
    expect(guide).toContain("`coinSourceMarkers.bitcoin`");
    expect(composition).toMatch(
      /coinSourceMarkers = \{\s*bitcoin: \[[^\]]*"\/recovery-mnemocode\/source\/core\/wallet-evidence\.ts"/u,
    );
  });

  it("keeps the adapter version equal to the vendored core version", () => {
    const manifest = JSON.parse(readFileSync(resolve(root, MNEMOCODE_MANIFEST), "utf8"));
    const adapter = readFileSync(
      resolve(root, "packages/recovery-backup/src/mnemocode.ts"),
      "utf8",
    );
    expect(adapter).toContain(`export const MNEMOCODE_VERSION = "${manifest.version}";`);
    expect(adapter).toContain("../../recovery-mnemocode/source/core.js");
    expect(MNEMOCODE_SOURCE_DIRECTORY).toBe("packages/recovery-mnemocode/source");
  });

  it("shows the vendored version on the page and in the documents", () => {
    const { version } = JSON.parse(readFileSync(resolve(root, MNEMOCODE_MANIFEST), "utf8"));
    expect(vendoredMnemoCodeVersion()).toBe(version);
    const page = readFileSync(resolve(root, "apps/key-derivation/src/index.html"), "utf8");
    // The page has a marker that the build fills; a number typed into the page would go stale.
    expect(page).not.toMatch(/MnemoCode \d+\.\d+/u);
    expect(page.match(/MnemoCode __MNEMOCODE_VERSION__/gu)).toHaveLength(2);
    const everything = { has: () => true, hasCoin: () => true, hasRecovery: true };
    const rendered = applyKeyDerivationFeatureTemplate(page, everything);
    expect(rendered).not.toContain("__MNEMOCODE_VERSION__");
    expect(rendered.split(`MnemoCode ${version}<`)).toHaveLength(3);
    for (const document of ["README.md", "docs/BUILD_MODULES.md"]) {
      const named =
        readFileSync(resolve(root, document), "utf8").match(/MnemoCode \d+\.\d+\.\d+/gu) ?? [];
      expect(named.length, document).toBeGreaterThan(0);
      for (const name of named) expect(name, document).toBe(`MnemoCode ${version}`);
    }
  });
});

/** A relative import as the TypeScript file it names; sources import `.js`, which tsc maps to `.ts`. */
function importedFile(fromFile, specifier) {
  return resolve(dirname(fromFile), specifier).replace(/\.js$/u, ".ts");
}

/**
 * The vendored MnemoCode files that the TypeScript sources below `directory` import, followed
 * through the vendored files' own relative imports, and the packages those files import.
 */
function vendoredFilesReachedFrom(directory) {
  const vendored = resolve(root, MNEMOCODE_SOURCE_DIRECTORY);
  const pending = readdirSync(directory, { recursive: true })
    .filter((path) => path.endsWith(".ts"))
    .flatMap((path) => {
      const file = resolve(directory, path);
      return importedSpecifiers(readFileSync(file, "utf8"))
        .filter((specifier) => specifier.startsWith("."))
        .map((specifier) => importedFile(file, specifier))
        .filter((target) => target.startsWith(`${vendored}/`));
    });
  const files = new Set();
  const packages = new Set();
  while (pending.length > 0) {
    const file = pending.pop();
    const path = relative(vendored, file);
    if (files.has(path)) continue;
    files.add(path);
    for (const specifier of importedSpecifiers(readFileSync(file, "utf8"))) {
      if (specifier.startsWith(".")) pending.push(importedFile(file, specifier));
      else packages.add(specifier);
    }
  }
  return { files: [...files].sort(), packages: [...packages].sort() };
}
