import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
      "@scure/bip32",
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
    for (const name of ["@scure/bip39", "pdf-lib", "@pdf-lib/fontkit"])
      expect(manifest.sharedDependencies[name], name).toBe(project.dependencies[name]);
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
