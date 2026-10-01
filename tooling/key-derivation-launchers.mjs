import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { getToolBuild } from "./build-profiles.mjs";

// The executable version of the Key Derivation Tool (apps/key-derivation/launcher) carries the
// tool's page inside it. Each one is built next to the page it embeds, in dist/, and named after it:
// Wallet_Key_Derivation_Tool.html gives Wallet_Key_Derivation_Tool-linux-x86_64 and so on.

/** Every platform a launcher is built for, with its Rust target. */
export const LAUNCHER_PLATFORMS = Object.freeze({
  "linux-x86_64": { target: "x86_64-unknown-linux-gnu", extension: "" },
  "linux-aarch64": { target: "aarch64-unknown-linux-gnu", extension: "" },
  "windows-x86_64": { target: "x86_64-pc-windows-gnu", extension: ".exe" },
  // Built on a macOS runner by the release workflow: Apple's SDK is not in the Linux container.
  "macos-aarch64": { target: "aarch64-apple-darwin", extension: "" },
  "macos-x86_64": { target: "x86_64-apple-darwin", extension: "" },
});

/** The platforms Dockerfile.launchers builds. */
export const CONTAINER_PLATFORMS = Object.freeze([
  "linux-x86_64",
  "linux-aarch64",
  "windows-x86_64",
]);

/**
 * The launcher platform of the computer this runs on, such as linux-x86_64. The build and the
 * verification of the executables both use it, so that they always mean the same file.
 */
export function hostPlatform(system = process.platform, machine = process.arch) {
  const systemName = { linux: "linux", win32: "windows", darwin: "macos" }[system];
  const machineName = { x64: "x86_64", arm64: "aarch64" }[machine];
  const platform = `${systemName}-${machineName}`;
  if (!Object.hasOwn(LAUNCHER_PLATFORMS, platform))
    throw new Error(`No launcher is defined for this computer (${system} ${machine}).`);
  return platform;
}

/** The file name of the launcher for `platform` that embeds the page `pageName`. */
export function launcherName(pageName, platform) {
  const entry = LAUNCHER_PLATFORMS[platform];
  if (entry === undefined) throw new Error(`Unknown launcher platform: ${platform}.`);
  return `${pageName.replace(/\.html$/u, "")}-${platform}${entry.extension}`;
}

/** The deriver page of `profile` in dist/, and the launchers for it that exist next to it. */
export function findLaunchers(dist, profile) {
  const page = resolve(dist, getToolBuild(profile, "key-derivation").artifactRelativePath);
  const launchers = Object.keys(LAUNCHER_PLATFORMS)
    .map((platform) => ({
      platform,
      path: resolve(page, "..", launcherName(basename(page), platform)),
    }))
    .filter(({ path }) => existsSync(path));
  return { page, launchers };
}

/**
 * Throws unless the launcher carries exactly these page bytes and their SHA-256, which it checks
 * again when it starts. A launcher left over from an older build of the page fails here.
 */
export function assertLauncherEmbedsPage(launcherBytes, pageBytes, label) {
  const digest = createHash("sha256").update(pageBytes).digest("hex");
  if (launcherBytes.indexOf(pageBytes) < 0 || launcherBytes.indexOf(Buffer.from(digest)) < 0) {
    throw new Error(
      `${label} does not embed the current page (SHA-256 ${digest}); build the launchers again.`,
    );
  }
}

/** Reads both files and applies assertLauncherEmbedsPage. */
export function assertLauncherFileEmbedsPage(launcherPath, pagePath) {
  assertLauncherEmbedsPage(
    readFileSync(launcherPath),
    readFileSync(pagePath),
    basename(launcherPath),
  );
}
