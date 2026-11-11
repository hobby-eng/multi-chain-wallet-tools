import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BUILD_PROFILES, getToolBuild, profileToolIds } from "./build-profiles.mjs";
import {
  assertPublishedManifestMatches,
  createReleaseAssets,
  verifyReleaseAssets,
} from "./github-release-assets.mjs";
import { LAUNCHER_PLATFORMS, launcherName } from "./key-derivation-launchers.mjs";
import { writeSidecar } from "./page-sidecar.mjs";
import { RELEASE_LEGAL_NAMES } from "./release-legal-documents.mjs";

const root = resolve(import.meta.dirname, "..");
const profile = BUILD_PROFILES["multi-chain"];
const RECORD = '{"fixture":true}';
// Computed with the `sha256sum` command from the literal fixture texts, not by this code.
const DERIVER_PAGE_SHA256 = "5f69fd31ec8377c98ecc4b50f673bb3dca0c48e4c6703e7b13ba7596917560d9";
const RECORD_SHA256 = "ffbc2dfc402782325da71132100e74ff511d1585dd80e4ea196ed4bcace3fef2";
const LINUX = "Wallet_Key_Derivation_Tool_Desktop-linux-x86_64";
const WINDOWS = "Wallet_Key_Derivation_Tool_Desktop-windows-x86_64.exe";
const RELEASED_PAGES_AND_PROGRAMS = [
  "PSBT_Multisig_Inspector.html",
  "SHA256SUMS",
  "Wallet_Activity_Viewer.html",
  "Wallet_Discovery_Scanner.html",
  "Wallet_Key_Derivation_Tool.html",
  LINUX,
  WINDOWS,
  "verification-record.json",
];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const pageText = (name) => `<!doctype html><title>${name}</title>`;
// A launcher fixture: some program bytes, then the page and its SHA-256, as the real one embeds them.
const launcherBytes = (page) =>
  Buffer.concat([Buffer.from("program"), Buffer.from(page), Buffer.from(sha256(page))]);

/** A build of every page with its sidecar, two Desktop executables and a record, in a temporary dist. */
function withBuild(check) {
  const folder = mkdtempSync(resolve(tmpdir(), "wallet-github-release-"));
  const dist = resolve(folder, "dist");
  const release = resolve(folder, "release");
  try {
    for (const toolId of profileToolIds(profile)) {
      const tool = getToolBuild(profile, toolId);
      const text = pageText(tool.artifactName);
      mkdirSync(resolve(dist, tool.artifactDirectory), { recursive: true });
      writeFileSync(resolve(dist, tool.artifactRelativePath), text);
      writeSidecar(resolve(dist, tool.artifactRelativePath), sha256(text), tool.artifactName);
    }
    const deriver = getToolBuild(profile, "key-derivation");
    const folderOf = (name) => resolve(dist, deriver.artifactDirectory, name);
    const deriverText = pageText(deriver.artifactName);
    // The last one is named like the page, as before the Desktop names: not an executable of it.
    for (const name of [LINUX, WINDOWS, "Wallet_Key_Derivation_Tool-linux-x86_64"])
      writeFileSync(folderOf(name), launcherBytes(deriverText));
    writeFileSync(resolve(dist, "verification-record.json"), RECORD);
    check({ folder, dist, release, folderOf, deriverText });
  } finally {
    rmSync(folder, { force: true, recursive: true });
  }
}

const manifestLines = (release) =>
  readFileSync(resolve(release, "SHA256SUMS"), "utf8").trimEnd().split("\n");

/** Every file of `folder` with its SHA-256, to show that a failed run changed none of them. */
const folderHashes = (folder) =>
  Object.fromEntries(
    readdirSync(folder).map((name) => [name, sha256(readFileSync(resolve(folder, name)))]),
  );

describe("flat GitHub release assets", () => {
  it("releases every asset under its plain name with one SHA256SUMS and no per-asset checksum file", () => {
    withBuild(({ dist, release }) => {
      createReleaseAssets(root, dist, profile, release);
      const files = readdirSync(release).sort();
      expect(files).toEqual([...RELEASED_PAGES_AND_PROGRAMS, ...RELEASE_LEGAL_NAMES].sort());
      expect(files.filter((name) => name.endsWith(".sha256"))).toEqual([]);
      // Nothing of the staging or the swap is left next to the release.
      expect(readdirSync(dirname(release)).sort()).toEqual(["dist", "release"]);

      // Every other asset once, sorted by file name, in the `<hex>  <name>` lines that
      // `sha256sum -c` reads.
      const lines = manifestLines(release);
      for (const line of lines) expect(line).toMatch(/^[0-9a-f]{64} {2}[A-Za-z0-9_.-]+$/u);
      expect(lines.map((line) => line.slice(66))).toEqual(
        files.filter((name) => name !== "SHA256SUMS"),
      );
      expect(lines).toContain(`${DERIVER_PAGE_SHA256}  Wallet_Key_Derivation_Tool.html`);
      expect(lines).toContain(`${RECORD_SHA256}  verification-record.json`);
      expect(() => verifyReleaseAssets(root, profile, release)).not.toThrow();
    });
  });

  it("accepts all five executables when the release workflow asks for all, and refuses fewer", () => {
    withBuild(({ dist, release, folderOf, deriverText }) => {
      createReleaseAssets(root, dist, profile, release);
      expect(() => verifyReleaseAssets(root, profile, release, { allLaunchers: true })).toThrow(
        "The release lacks executable versions: Wallet_Key_Derivation_Tool_Desktop-linux-aarch64, " +
          "Wallet_Key_Derivation_Tool_Desktop-macos-aarch64, Wallet_Key_Derivation_Tool_Desktop-macos-x86_64",
      );
      for (const platform of Object.keys(LAUNCHER_PLATFORMS))
        writeFileSync(
          folderOf(launcherName("Wallet_Key_Derivation_Tool.html", platform)),
          launcherBytes(deriverText),
        );
      createReleaseAssets(root, dist, profile, release);
      expect(() =>
        verifyReleaseAssets(root, profile, release, { allLaunchers: true }),
      ).not.toThrow();
      // Four pages, five executables, the record and the legal documents.
      expect(manifestLines(release)).toHaveLength(4 + 5 + 1 + RELEASE_LEGAL_NAMES.length);
    });
  });

  it("replaces a release only with a complete new one", () => {
    withBuild(({ dist, release, folderOf, deriverText }) => {
      createReleaseAssets(root, dist, profile, release);
      const changed = `${deriverText}<p>changed</p>`;
      writeFileSync(folderOf("Wallet_Key_Derivation_Tool.html"), changed);
      writeSidecar(
        folderOf("Wallet_Key_Derivation_Tool.html"),
        sha256(changed),
        "Wallet_Key_Derivation_Tool.html",
      );
      for (const name of [LINUX, WINDOWS]) writeFileSync(folderOf(name), launcherBytes(changed));
      createReleaseAssets(root, dist, profile, release);
      expect(readFileSync(resolve(release, "Wallet_Key_Derivation_Tool.html"), "utf8")).toBe(
        changed,
      );
      expect(manifestLines(release)).toContain(
        `${sha256(changed)}  Wallet_Key_Derivation_Tool.html`,
      );
      expect(readdirSync(dirname(release)).sort()).toEqual(["dist", "release"]);
    });
  });

  it.each([
    [
      "a missing page",
      ({ folderOf }) => rmSync(folderOf("Wallet_Key_Derivation_Tool.html")),
      "Release artifact is missing",
    ],
    [
      "a page changed after its build",
      ({ folderOf, deriverText }) =>
        writeFileSync(folderOf("Wallet_Key_Derivation_Tool.html"), `${deriverText}changed`),
      "The checksum sidecar of Wallet_Key_Derivation_Tool.html is missing or does not match it.",
    ],
    [
      "an executable of an older page",
      ({ folderOf }) => writeFileSync(folderOf(WINDOWS), launcherBytes(pageText("older"))),
      `${WINDOWS} does not embed the current page`,
    ],
    [
      "a missing verification record",
      ({ dist }) => rmSync(resolve(dist, "verification-record.json")),
      "verification-record.json is missing",
    ],
  ])(
    "keeps the previous release, byte for byte, when a new one stops on %s",
    (_, damage, message) => {
      withBuild((fixture) => {
        createReleaseAssets(root, fixture.dist, profile, fixture.release);
        const before = folderHashes(fixture.release);
        damage(fixture);
        expect(() => createReleaseAssets(root, fixture.dist, profile, fixture.release)).toThrow(
          message,
        );
        expect(folderHashes(fixture.release)).toEqual(before);
        expect(readdirSync(dirname(fixture.release)).sort()).toEqual(["dist", "release"]);
      });
    },
  );

  it("keeps the previous release when a legal document is missing while the new one is copied", () => {
    withBuild(({ folder, dist, release }) => {
      createReleaseAssets(root, dist, profile, release);
      const before = folderHashes(release);
      // A source tree without the legal documents fails in the middle of the copying.
      const emptyRoot = resolve(folder, "empty-root");
      mkdirSync(emptyRoot);
      expect(() => createReleaseAssets(emptyRoot, dist, profile, release)).toThrow(
        "Legal document LICENSE is missing.",
      );
      expect(folderHashes(release)).toEqual(before);
      expect(existsSync(`${release}.staging`)).toBe(false);
    });
  });
});

describe("the verifier of a flat GitHub release", () => {
  /** Rewrites SHA256SUMS with `lines` and expects the verifier to refuse it with `message`. */
  const refusesManifest = (release, lines, message) => {
    const manifest = resolve(release, "SHA256SUMS");
    const complete = readFileSync(manifest, "utf8");
    writeFileSync(manifest, `${lines.join("\n")}\n`);
    expect(() => verifyReleaseAssets(root, profile, release)).toThrow(message);
    writeFileSync(manifest, complete);
  };

  it("refuses a per-asset checksum file and a changed asset", () => {
    withBuild(({ dist, release }) => {
      createReleaseAssets(root, dist, profile, release);
      const extra = resolve(release, "Wallet_Key_Derivation_Tool.html.sha256");
      writeFileSync(extra, `${DERIVER_PAGE_SHA256}  Wallet_Key_Derivation_Tool.html\n`);
      expect(() => verifyReleaseAssets(root, profile, release)).toThrow(
        /Unexpected GitHub release asset set/u,
      );
      rmSync(extra);
      writeFileSync(resolve(release, "Wallet_Activity_Viewer.html"), "<!doctype html>changed");
      expect(() => verifyReleaseAssets(root, profile, release)).toThrow(
        "Flat release checksum mismatch for Wallet_Activity_Viewer.html.",
      );
    });
  });

  it("refuses a missing, duplicate, unlisted, malformed or unsorted SHA256SUMS line", () => {
    withBuild(({ dist, release }) => {
      createReleaseAssets(root, dist, profile, release);
      const lines = manifestLines(release);
      const linuxLine = lines.find((line) => line.endsWith(`  ${LINUX}`));
      const others = lines.filter((line) => line !== linuxLine);
      refusesManifest(release, others, `Flat SHA256SUMS is missing: ${LINUX}`);
      refusesManifest(
        release,
        [...lines, linuxLine],
        `Unexpected or duplicate flat release artifact: ${LINUX}`,
      );
      refusesManifest(
        release,
        [...others, `${"0".repeat(64)}  notes.txt`],
        "Unexpected or duplicate flat release artifact: notes.txt",
      );
      refusesManifest(
        release,
        [...others, `${linuxLine.slice(0, 64)} *${LINUX}`],
        `Malformed flat SHA256SUMS line: ${linuxLine.slice(0, 64)} *${LINUX}`,
      );
      refusesManifest(release, lines.toReversed(), "Flat SHA256SUMS is not sorted by file name.");
      expect(() => verifyReleaseAssets(root, profile, release)).not.toThrow();
    });
  });

  it("refuses a listed executable that does not embed the released page", () => {
    withBuild(({ dist, release }) => {
      createReleaseAssets(root, dist, profile, release);
      const older = launcherBytes(pageText("older"));
      writeFileSync(resolve(release, LINUX), older);
      const lines = manifestLines(release).map((line) =>
        line.endsWith(`  ${LINUX}`) ? `${sha256(older)}  ${LINUX}` : line,
      );
      writeFileSync(resolve(release, "SHA256SUMS"), `${lines.join("\n")}\n`);
      expect(() => verifyReleaseAssets(root, profile, release)).toThrow(
        `${LINUX} does not embed the current page`,
      );
    });
  });
});

describe("the published SHA256SUMS a maintainer signs", () => {
  const line = (name) => `${"a".repeat(64)}  ${name}`;

  it("matches a local bundle that lacks the executables built on GitHub's runners", () => {
    withBuild(({ dist, release }) => {
      createReleaseAssets(root, dist, profile, release);
      const local = manifestLines(release);
      const others = Object.keys(LAUNCHER_PLATFORMS)
        .map((platform) => launcherName("Wallet_Key_Derivation_Tool.html", platform))
        .filter((name) => name !== LINUX && name !== WINDOWS);
      const published = `${[...local, ...others.map(line)].join("\n")}\n`;
      expect(assertPublishedManifestMatches(published, release, profile)).toEqual(
        local.map((entry) => entry.slice(66)),
      );
    });
  });

  it("refuses another SHA-256, a local file it does not list, a malformed line and a name twice", () => {
    withBuild(({ dist, release }) => {
      createReleaseAssets(root, dist, profile, release);
      const local = manifestLines(release);
      const record = local.find((entry) => entry.endsWith("  verification-record.json"));
      const without = local.filter((entry) => entry !== record);
      const check = (lines) => () =>
        assertPublishedManifestMatches(lines.join("\n"), release, profile);
      expect(check([...without, `${"0".repeat(64)}  verification-record.json`])).toThrow(
        "The published SHA256SUMS records another SHA-256 for verification-record.json.",
      );
      expect(check(without)).toThrow(
        "The published SHA256SUMS does not list verification-record.json.",
      );
      expect(check([...local, "not a line"])).toThrow("Malformed flat SHA256SUMS line: not a line");
      expect(check([...local, record])).toThrow("The published SHA256SUMS lists a file twice.");
    });
  });

  it("refuses a line for itself, its signature, another file or another edition's executable", () => {
    withBuild(({ dist, release }) => {
      createReleaseAssets(root, dist, profile, release);
      const local = manifestLines(release);
      for (const name of [
        "SHA256SUMS",
        "SHA256SUMS.asc",
        "notes.txt",
        "Dash_Community_Key_Derivation_Tool_Desktop-macos-aarch64",
      ]) {
        expect(() =>
          assertPublishedManifestMatches([...local, line(name)].join("\n"), release, profile),
        ).toThrow(`The published SHA256SUMS lists ${name}, which no bundle has.`);
      }
      // An edition without Desktop executables accepts none it lacks either.
      const withoutDesktop = { ...profile, desktopExecutables: false };
      rmSync(resolve(release, LINUX));
      rmSync(resolve(release, WINDOWS));
      const pagesOnly = local.filter((entry) => !entry.includes("_Desktop-"));
      expect(() =>
        assertPublishedManifestMatches(
          [...pagesOnly, line("Wallet_Key_Derivation_Tool_Desktop-macos-aarch64")].join("\n"),
          release,
          withoutDesktop,
        ),
      ).toThrow("lists Wallet_Key_Derivation_Tool_Desktop-macos-aarch64, which no bundle has.");
    });
  });
});

describe("an edition's Desktop executables in its bundle", () => {
  const withoutDesktop = { ...profile, desktopExecutables: false };

  it("refuses executables, or a demand for all of them, for an edition without them", () => {
    withBuild(({ dist, release, folderOf }) => {
      expect(() => createReleaseAssets(root, dist, withoutDesktop, release)).toThrow(
        `Multi-Chain Edition has no Desktop executables, but dist/ holds ${LINUX}, ${WINDOWS}.`,
      );
      expect(existsSync(release)).toBe(false);
      createReleaseAssets(root, dist, profile, release);
      expect(() => verifyReleaseAssets(root, withoutDesktop, release)).toThrow(
        "Multi-Chain Edition has no Desktop executables; its release must carry none.",
      );
      for (const name of [LINUX, WINDOWS]) rmSync(folderOf(name));
      createReleaseAssets(root, dist, withoutDesktop, release);
      expect(() => verifyReleaseAssets(root, withoutDesktop, release)).not.toThrow();
      expect(() =>
        verifyReleaseAssets(root, withoutDesktop, release, { allLaunchers: true }),
      ).toThrow("Multi-Chain Edition has no Desktop executables; its release must carry none.");
    });
  });
});

describe("a release folder after a run cut off in the middle of its swap", () => {
  /** The state a run leaves when it stops after moving `release` aside, before moving the new one in. */
  const cutBetweenRenames = (release) => renameSync(release, `${release}.previous`);

  it("is restored, byte for byte, by a next run that fails", () => {
    withBuild(({ dist, release }) => {
      createReleaseAssets(root, dist, profile, release);
      const before = folderHashes(release);
      cutBetweenRenames(release);
      rmSync(resolve(dist, "verification-record.json"));
      expect(() => createReleaseAssets(root, dist, profile, release)).toThrow(
        "verification-record.json is missing",
      );
      expect(folderHashes(release)).toEqual(before);
      expect(readdirSync(dirname(release)).sort()).toEqual(["dist", "release"]);
    });
  });

  it("is replaced by a next run that succeeds, leaving nothing of the cut run", () => {
    withBuild(({ dist, release }) => {
      createReleaseAssets(root, dist, profile, release);
      cutBetweenRenames(release);
      mkdirSync(`${release}.staging`);
      writeFileSync(resolve(`${release}.staging`, "partial"), "x");
      createReleaseAssets(root, dist, profile, release);
      expect(() => verifyReleaseAssets(root, profile, release)).not.toThrow();
      expect(readdirSync(dirname(release)).sort()).toEqual(["dist", "release"]);
    });
  });

  it("loses the leftover previous folder of a swap cut off after its second rename", () => {
    withBuild(({ dist, release }) => {
      createReleaseAssets(root, dist, profile, release);
      cpSync(release, `${release}.previous`, { recursive: true });
      rmSync(resolve(dist, "verification-record.json"));
      expect(() => createReleaseAssets(root, dist, profile, release)).toThrow(
        "verification-record.json is missing",
      );
      expect(readdirSync(dirname(release)).sort()).toEqual(["dist", "release"]);
      expect(() => verifyReleaseAssets(root, profile, release)).not.toThrow();
    });
  });
});
