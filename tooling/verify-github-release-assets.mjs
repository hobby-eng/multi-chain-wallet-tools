import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getToolBuild, parseBuildProfile, profileArtifacts } from "./build-profiles.mjs";
import {
  assertLauncherFileEmbedsPage,
  LAUNCHER_PLATFORMS,
  launcherName,
} from "./key-derivation-launchers.mjs";
import { assertReleaseLegalDocuments, RELEASE_LEGAL_NAMES } from "./release-legal-documents.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const profile = parseBuildProfile();
const release = resolve(root, profile.releaseDirectory);
const expectedArtifacts = profileArtifacts(profile)
  .map((artifact) => basename(artifact))
  .sort();
const actualFiles = readdirSync(release).sort();
// The executable Key Derivation Tool for each platform it was built for. --all-launchers, used by
// the release workflow, requires every platform.
const deriverPage = basename(getToolBuild(profile, "key-derivation").artifactRelativePath);
const allLaunchers = Object.keys(LAUNCHER_PLATFORMS).map((platform) =>
  launcherName(deriverPage, platform),
);
const launchers = allLaunchers.filter((name) => actualFiles.includes(name));
if (process.argv.includes("--all-launchers") && launchers.length !== allLaunchers.length) {
  const missing = allLaunchers.filter((name) => !launchers.includes(name));
  throw new Error(`The release lacks executable versions: ${missing.join(", ")}`);
}
const expectedFiles = new Set([
  ...expectedArtifacts,
  ...expectedArtifacts.map((name) => `${name}.sha256`),
  ...launchers,
  ...launchers.map((name) => `${name}.sha256`),
  ...RELEASE_LEGAL_NAMES,
  "verification-record.json",
  "SHA256SUMS",
]);

if (
  actualFiles.length !== expectedFiles.size ||
  actualFiles.some((name) => !expectedFiles.has(name))
) {
  throw new Error(`Unexpected GitHub release asset set: ${actualFiles.join(", ")}`);
}

const lines = readFileSync(resolve(release, "SHA256SUMS"), "utf8").trim().split("\n");
if (lines.length !== expectedArtifacts.length + launchers.length + RELEASE_LEGAL_NAMES.length + 1) {
  throw new Error(
    `Flat SHA256SUMS must contain ${expectedArtifacts.length} standalone HTML file(s), ${launchers.length} executable(s), ${RELEASE_LEGAL_NAMES.join(", ")}, and verification-record.json.`,
  );
}

const remaining = new Set([
  ...expectedArtifacts,
  ...launchers,
  ...RELEASE_LEGAL_NAMES,
  "verification-record.json",
]);
const filesWithoutSidecar = new Set([...RELEASE_LEGAL_NAMES, "verification-record.json"]);
for (const line of lines) {
  const match = /^([0-9a-f]{64})  ([A-Za-z0-9_.-]+)$/u.exec(line);
  if (match === null) throw new Error(`Malformed flat SHA256SUMS line: ${line}`);
  const [, recorded, name] = match;
  if (basename(name) !== name || !remaining.delete(name)) {
    throw new Error(`Unexpected or duplicate flat release artifact: ${name}`);
  }
  const actual = createHash("sha256")
    .update(readFileSync(resolve(release, name)))
    .digest("hex");
  if (recorded !== actual) throw new Error(`Flat release checksum mismatch for ${name}.`);
  if (
    !filesWithoutSidecar.has(name) &&
    readFileSync(resolve(release, `${name}.sha256`), "utf8").trim() !== `${actual}  ${name}`
  ) {
    throw new Error(`Flat release sidecar mismatch for ${name}.`);
  }
}
if (remaining.size !== 0)
  throw new Error(`Flat release manifest is missing: ${[...remaining].join(", ")}`);
for (const name of launchers) {
  assertLauncherFileEmbedsPage(resolve(release, name), resolve(release, deriverPage));
}
assertReleaseLegalDocuments(root, release);
console.log(`Verified the exact flat ${profile.editionName} release asset set and all checksums.`);
