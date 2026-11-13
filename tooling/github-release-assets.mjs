import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, resolve } from "node:path";
import {
  CHECKSUM_MANIFEST_NAME,
  getToolBuild,
  profileToolIds,
  VERIFICATION_RECORD_NAME,
} from "./build-profiles.mjs";
import {
  assertLauncherFileEmbedsPage,
  findLaunchers,
  LAUNCHER_PLATFORMS,
  launcherName,
} from "./key-derivation-launchers.mjs";
import { sidecarRecords } from "./page-sidecar.mjs";
import {
  assertReleaseLegalDocuments,
  copyReleaseLegalDocuments,
  RELEASE_LEGAL_NAMES,
} from "./release-legal-documents.mjs";

// The assets of a GitHub release are flat: plain file names in one folder. One checksum file,
// CHECKSUM_MANIFEST_NAME, lists every other asset in the format `sha256sum -c` reads, sorted by file
// name for the people who read it, and no asset has a checksum file of its own,
// so that a user knows the one file to download and check. The checksum file the HTML build writes
// next to each page (page-sidecar.mjs) stays in dist/: a release is made only from pages that still
// match it. The release workflow's publishing job installs no dependencies, so this module and its
// imports must need no installed package.

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
// The file name of a `<hex>  <name>` line: 64 hex digits and two spaces come first.
const NAME_OFFSET = 66;
const byFileName = (left, right) => {
  const [a, b] = [left.slice(NAME_OFFSET), right.slice(NAME_OFFSET)];
  return a < b ? -1 : a > b ? 1 : 0;
};

/**
 * The lines of a flat checksum file's text as `{ digest, name, line }`, refused when a line is not
 * `<hex>  <plain file name>`.
 */
function manifestEntries(text) {
  return text
    .trim()
    .split("\n")
    .map((line) => {
      const match = /^([0-9a-f]{64}) {2}([A-Za-z0-9_.-]+)$/u.exec(line);
      if (match === null) throw new Error(`Malformed flat ${CHECKSUM_MANIFEST_NAME} line: ${line}`);
      return { digest: match[1], name: match[2], line };
    });
}

/** The standalone pages of `profile`: each one's release name and its path in `dist`. */
function profilePages(dist, profile) {
  return profileToolIds(profile).map((toolId) => {
    const tool = getToolBuild(profile, toolId);
    return { name: tool.artifactName, path: resolve(dist, tool.artifactRelativePath) };
  });
}

/** Throws unless the page in dist/ still has the SHA-256 its sidecar recorded when it was built. */
function assertPageMatchesSidecar({ name, path }) {
  if (!existsSync(path)) {
    throw new Error(`Release artifact is missing: ${path}. Run the HTML build first.`);
  }
  if (!sidecarRecords(path, sha256(readFileSync(path)), name)) {
    throw new Error(`The checksum sidecar of ${name} is missing or does not match it.`);
  }
}

/** Copies `source` into `release` as `name` and returns its checksum line, from the copy's bytes. */
function copyAsset(source, release, name) {
  const destination = resolve(release, name);
  copyFileSync(source, destination);
  return `${sha256(readFileSync(destination))}  ${name}`;
}

/**
 * Puts back the folder `target` that a swap (replaceFolder) cut off between its two renames left
 * under `<target>.previous`, and removes a `<target>.previous` that a finished swap left behind.
 */
function recoverInterruptedSwap(target) {
  const previous = `${target}.previous`;
  if (existsSync(previous) && !existsSync(target)) renameSync(previous, target);
  rmSync(previous, { force: true, recursive: true });
}

/**
 * Puts the complete folder `next` in the place of `target`. Each rename is atomic; between the two,
 * the previous folder waits under `<target>.previous`, from where recoverInterruptedSwap restores it
 * if the swap was cut off there.
 */
function replaceFolder(next, target) {
  const previous = `${target}.previous`;
  recoverInterruptedSwap(target);
  if (existsSync(target)) renameSync(target, previous);
  try {
    renameSync(next, target);
  } catch (error) {
    if (existsSync(previous)) renameSync(previous, target);
    throw error;
  }
  rmSync(previous, { force: true, recursive: true });
}

/**
 * Makes `release` hold exactly the release assets of `profile` from its build in `dist`: the
 * standalone pages, the Desktop executables built next to the Deriver page (only for an edition that
 * has them), the verification record, the legal documents of `root`, and the one checksum file. The
 * assets are made and verified in a staging folder next to `release`, which replaces it only when
 * complete (AUD-034-BLD003): a page that no longer matches its sidecar, an executable that does not
 * embed the current Deriver page, or a missing record or legal document leaves the previous `release`
 * as it was, also after an earlier run was cut off in the middle of its swap.
 */
export function createReleaseAssets(root, dist, profile, release) {
  recoverInterruptedSwap(release);
  const pages = profilePages(dist, profile);
  for (const page of pages) assertPageMatchesSidecar(page);
  // The executable versions of the Key Derivation Tool that were built next to its page. Each must
  // embed exactly the page of this release; one left over from an older build stops the release.
  const { page: deriverPage, launchers } = findLaunchers(dist, profile);
  if (!profile.desktopExecutables && launchers.length > 0) {
    throw new Error(
      `${profile.editionName} has no Desktop executables, but dist/ holds ${launchers.map(({ path }) => basename(path)).join(", ")}.`,
    );
  }
  for (const { path } of launchers) assertLauncherFileEmbedsPage(path, deriverPage);
  const record = resolve(dist, VERIFICATION_RECORD_NAME);
  if (!existsSync(record)) {
    throw new Error(
      `${VERIFICATION_RECORD_NAME} is missing. Run tooling/create-verification-record.mjs after building artifacts.`,
    );
  }

  const staging = `${release}.staging`;
  rmSync(staging, { force: true, recursive: true });
  mkdirSync(staging, { recursive: true });
  try {
    const manifest = [
      ...pages.map(({ path, name }) => copyAsset(path, staging, name)),
      ...launchers.map(({ path }) => copyAsset(path, staging, basename(path))),
      copyAsset(record, staging, VERIFICATION_RECORD_NAME),
      ...copyReleaseLegalDocuments(root, staging),
    ];
    writeFileSync(
      resolve(staging, CHECKSUM_MANIFEST_NAME),
      `${manifest.sort(byFileName).join("\n")}\n`,
    );
    verifyReleaseAssets(root, profile, staging);
    replaceFolder(staging, release);
  } finally {
    rmSync(staging, { force: true, recursive: true });
  }
}

/** The file names of the Desktop executables of `profile`, one for each platform. */
function desktopExecutableNames(profile) {
  const deriverPage = getToolBuild(profile, "key-derivation").artifactName;
  return Object.keys(LAUNCHER_PLATFORMS).map((platform) => launcherName(deriverPage, platform));
}

/**
 * Throws unless `release` holds exactly the release assets of `profile` and its checksum file lists
 * every other asset once, sorted by file name, with its SHA-256: the pages, the Desktop executables
 * present (all five with `allLaunchers`, as the release workflow requires; none for an edition
 * without them), the verification record and the legal documents of `root`, byte for byte. Any
 * other file, such as a per-asset .sha256, is refused.
 */
export function verifyReleaseAssets(root, profile, release, { allLaunchers = false } = {}) {
  const pages = profileToolIds(profile).map((toolId) => getToolBuild(profile, toolId).artifactName);
  const deriverPage = getToolBuild(profile, "key-derivation").artifactName;
  const actualFiles = readdirSync(release).sort();
  const everyLauncher = desktopExecutableNames(profile);
  const launchers = everyLauncher.filter((name) => actualFiles.includes(name));
  if (!profile.desktopExecutables && (allLaunchers || launchers.length > 0)) {
    throw new Error(
      `${profile.editionName} has no Desktop executables; its release must carry none.`,
    );
  }
  if (allLaunchers && launchers.length !== everyLauncher.length) {
    const missing = everyLauncher.filter((name) => !launchers.includes(name));
    throw new Error(`The release lacks executable versions: ${missing.join(", ")}`);
  }
  const listed = [...pages, ...launchers, VERIFICATION_RECORD_NAME, ...RELEASE_LEGAL_NAMES];
  const expectedFiles = new Set([...listed, CHECKSUM_MANIFEST_NAME]);
  if (
    actualFiles.length !== expectedFiles.size ||
    actualFiles.some((name) => !expectedFiles.has(name))
  ) {
    throw new Error(`Unexpected GitHub release asset set: ${actualFiles.join(", ")}`);
  }

  const remaining = new Set(listed);
  const entries = manifestEntries(readFileSync(resolve(release, CHECKSUM_MANIFEST_NAME), "utf8"));
  for (const { digest, name } of entries) {
    if (!remaining.delete(name)) {
      throw new Error(`Unexpected or duplicate flat release artifact: ${name}`);
    }
    if (digest !== sha256(readFileSync(resolve(release, name)))) {
      throw new Error(`Flat release checksum mismatch for ${name}.`);
    }
  }
  if (
    entries.some(({ line }, index) => index > 0 && byFileName(entries[index - 1].line, line) > 0)
  ) {
    throw new Error(`Flat ${CHECKSUM_MANIFEST_NAME} is not sorted by file name.`);
  }
  if (remaining.size !== 0) {
    throw new Error(`Flat ${CHECKSUM_MANIFEST_NAME} is missing: ${[...remaining].join(", ")}`);
  }
  for (const name of launchers) {
    assertLauncherFileEmbedsPage(resolve(release, name), resolve(release, deriverPage));
  }
  assertReleaseLegalDocuments(root, release);
}

/**
 * Throws unless `published`, the text of the checksum file of a published release of `profile`,
 * lists every asset of the local bundle in `release` with the same SHA-256, and nothing else but the
 * edition's Desktop executables the local bundle lacks, such as those built on GitHub's macOS
 * runners. A line for SHA256SUMS itself, its signature or any other file is refused. Returns the
 * names it compared, so that a signature is made only after the published file matched the rebuild.
 */
export function assertPublishedManifestMatches(published, release, profile) {
  const entries = manifestEntries(published);
  const recorded = new Map(entries.map(({ digest, name }) => [name, digest]));
  if (recorded.size !== entries.length) {
    throw new Error(`The published ${CHECKSUM_MANIFEST_NAME} lists a file twice.`);
  }
  const local = readdirSync(release)
    .filter((name) => name !== CHECKSUM_MANIFEST_NAME)
    .sort();
  const notBuiltHere = profile.desktopExecutables
    ? desktopExecutableNames(profile).filter((name) => !local.includes(name))
    : [];
  for (const name of recorded.keys()) {
    if (!local.includes(name) && !notBuiltHere.includes(name)) {
      throw new Error(
        `The published ${CHECKSUM_MANIFEST_NAME} lists ${name}, which no bundle has.`,
      );
    }
  }
  for (const name of local) {
    if (!recorded.has(name)) {
      throw new Error(`The published ${CHECKSUM_MANIFEST_NAME} does not list ${name}.`);
    }
    if (recorded.get(name) !== sha256(readFileSync(resolve(release, name)))) {
      throw new Error(
        `The published ${CHECKSUM_MANIFEST_NAME} records another SHA-256 for ${name}.`,
      );
    }
  }
  return local;
}
