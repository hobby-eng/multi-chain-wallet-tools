import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CHECKSUM_MANIFEST_NAME, parseBuildProfile } from "./build-profiles.mjs";
import { assertPublishedManifestMatches } from "./github-release-assets.mjs";
import { readReleaseMetadata } from "./project-metadata.mjs";
import { isMainScript, runCommand } from "./run-script.mjs";

// The optional OpenPGP approval of a published release: signs the release's own SHA256SUMS, the
// bytes users download, after checking it against the local reproducible bundle. A local bundle has
// no macOS executables (only GitHub's macOS runners build them), so its own SHA256SUMS never equals
// the published one and a signature of it would not verify. Usage:
//   node tooling/sign-release.mjs [--profile multi-chain] [--tag v<version>] [GPG key ID]
// It downloads the published SHA256SUMS with the GitHub CLI and writes SHA256SUMS.asc next to it in
// dist/<edition>/signature/, to be uploaded to the release as its one signature file.

const TAG = /^v[0-9]+\.[0-9]+\.[0-9]+(?:-rc\.[0-9]+)?$/u;
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

/**
 * The tag and the GPG key ID of the command line `args`; the tag is `defaultTag` without --tag. It
 * refuses what it would otherwise misread, so that a typing slip never signs the wrong release: an
 * unknown option, --tag=v… written as one argument, --tag without a value, a tag given without
 * --tag, and a second key ID.
 */
export function signingArguments(args, defaultTag) {
  let tag;
  let signer;
  // pnpm passes the "--" that separates a script's arguments on to it.
  const rest = args.filter((arg) => arg !== "--");
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--profile" || arg === "--tag") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`${arg} needs a value.`);
      if (arg === "--tag") tag = value;
      index += 1;
    } else if (arg.startsWith("--profile=")) {
      continue;
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option ${arg}: give the tag as --tag v<version>, two arguments.`);
    } else if (/^v[0-9]/u.test(arg)) {
      throw new Error(`${arg} looks like a tag: give it as --tag ${arg}.`);
    } else if (signer !== undefined) {
      throw new Error(`Give one GPG key ID, not ${signer} and ${arg}.`);
    } else {
      signer = arg;
    }
  }
  const chosen = tag ?? defaultTag;
  if (!TAG.test(chosen)) throw new Error(`Not a release tag: ${chosen}.`);
  return { tag: chosen, signer };
}

function signPublishedManifest(args) {
  const profile = parseBuildProfile(args.filter((arg) => arg !== "--"));
  const { tag, signer } = signingArguments(args, readReleaseMetadata(root).tag);
  const release = resolve(root, profile.releaseDirectory);
  if (!existsSync(resolve(release, CHECKSUM_MANIFEST_NAME))) {
    throw new Error(
      `${profile.releaseDirectory} is missing: run ./tooling/build-reproducible.sh first.`,
    );
  }
  const folder = resolve(root, "dist", profile.outputDirectory, "signature");
  rmSync(folder, { force: true, recursive: true });
  mkdirSync(folder, { recursive: true });
  runCommand("gh", [
    "release",
    "download",
    tag,
    "--repo",
    profile.releaseRepository,
    "--pattern",
    CHECKSUM_MANIFEST_NAME,
    "--dir",
    folder,
  ]);
  const manifest = resolve(folder, CHECKSUM_MANIFEST_NAME);
  const compared = assertPublishedManifestMatches(readFileSync(manifest, "utf8"), release, profile);
  console.log(
    `The published ${CHECKSUM_MANIFEST_NAME} of ${tag} matches the ${compared.length} files of ${profile.releaseDirectory}.`,
  );
  runCommand("gpg", [
    "--armor",
    "--detach-sign",
    "--output",
    `${manifest}.asc`,
    ...(signer === undefined ? [] : ["--local-user", signer]),
    manifest,
  ]);
  console.log(
    `Signed it as ${folder}/${CHECKSUM_MANIFEST_NAME}.asc; upload that file to ${tag} of ${profile.releaseRepository}.`,
  );
}

if (isMainScript(import.meta.url)) signPublishedManifest(process.argv.slice(2));
