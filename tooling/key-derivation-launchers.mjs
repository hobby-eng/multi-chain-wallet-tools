import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { basename, resolve } from "node:path";
import { BUILD_PROFILES, getToolBuild } from "./build-profiles.mjs";

// The executable version of the Key Derivation Tool (apps/key-derivation/launcher) carries the
// tool's page inside it: the whole Deriver, served to this computer only so that MHFE runs in fast
// mode. Each one is built next to the page it embeds, in dist/, and named after it with a suffix
// that tells the two apart in a release (owner, 2026-11-11): Wallet_Key_Derivation_Tool.html gives
// Wallet_Key_Derivation_Tool_Desktop-linux-x86_64 and so on.

/** What a launcher's name adds to the name of the page it embeds, before its platform. */
const LAUNCHER_NAME_SUFFIX = "_Desktop";

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

/** The page's name without .html, which every launcher name of the page starts with. */
function pageStem(pageName) {
  return pageName.replace(/\.html$/u, "");
}

/** The extension of the launcher for `platform`, which must be one of LAUNCHER_PLATFORMS. */
function launcherExtension(platform) {
  const entry = LAUNCHER_PLATFORMS[platform];
  if (entry === undefined) throw new Error(`Unknown launcher platform: ${platform}.`);
  return entry.extension;
}

/** What every launcher name of the page `pageName` starts with, up to its platform. */
function launcherNamePrefix(pageName) {
  return `${pageStem(pageName)}${LAUNCHER_NAME_SUFFIX}-`;
}

/** The file name of the launcher for `platform` that embeds the page `pageName`. */
export function launcherName(pageName, platform) {
  return `${launcherNamePrefix(pageName)}${platform}${launcherExtension(platform)}`;
}

/**
 * How a person's text names the launchers of the page `pageName`, for every platform at once:
 * Wallet_Key_Derivation_Tool_Desktop-<platform>.
 */
export function launcherNamePattern(pageName) {
  return `${launcherNamePrefix(pageName)}<platform>`;
}

/**
 * Removes the launchers named like the page itself, as builds before the Desktop names wrote them
 * (Wallet_Key_Derivation_Tool-linux-x86_64), from the folder of `page`. Each embeds an older page;
 * no release takes them, and none may stay where a bundle is made. A page whose own name ends in
 * the Desktop suffix is left alone: its old names would be the current names of another page.
 */
export function removeLegacyLaunchers(page) {
  const stem = pageStem(basename(page));
  if (stem.endsWith(LAUNCHER_NAME_SUFFIX)) return;
  for (const platform of Object.keys(LAUNCHER_PLATFORMS)) {
    rmSync(resolve(page, "..", `${stem}-${platform}${launcherExtension(platform)}`), {
      force: true,
    });
  }
}

/** The marker of the Deriver template where its help says how to get the executable version. */
export const DESKTOP_VERSION_MARKER = "__DESKTOP_VERSION_NOTE__";

/** `text` with the characters that HTML text must escape escaped. */
const escapeHtml = (text) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/**
 * What the Deriver page and the documents of `profile` say about getting the executable version:
 * the Desktop file that every release of the edition carries, or, for an edition without one, that
 * it is built from source. The one source of that sentence, as plain `text` (the page's script), as
 * `html` and as `markdown`, where the file name is code.
 */
export function desktopVersionNote(profile) {
  const name = launcherNamePattern(getToolBuild(profile, "key-derivation").artifactName);
  const [before, after] = profile.desktopExecutables
    ? ["Each release carries it for every platform as ", "."]
    : [
        "No executable is published for this edition: build it from source (",
        "), or use the mhfe command-line program.",
      ];
  return {
    text: `${before}${name}${after}`,
    html: `${escapeHtml(before)}<code>${escapeHtml(name)}</code>${escapeHtml(after)}`,
    markdown: `${before}\`${name}\`${after}`,
  };
}

/**
 * Throws unless the Deriver page `html` of `profile` keeps no Desktop marker, names no other
 * edition's executable, and, where MHFE's panel is built in, shows the edition's own note on the
 * executable version in its help and in its script.
 */
export function assertDesktopVersionNote(html, profile) {
  const leftover = /__DESKTOP_[A-Z_]+__/u.exec(html);
  if (leftover !== null) throw new Error(`The Deriver page keeps the marker ${leftover[0]}.`);
  for (const other of Object.values(BUILD_PROFILES)) {
    if (other.id === profile.id) continue;
    const prefix = launcherNamePrefix(getToolBuild(other, "key-derivation").artifactName);
    if (html.includes(prefix)) {
      throw new Error(`The ${profile.editionName} Deriver page names the executable ${prefix}….`);
    }
  }
  if (!html.includes('id="mhfe-panel"')) return;
  const note = desktopVersionNote(profile);
  if (!html.includes(note.html) || !html.includes(note.text)) {
    throw new Error(`The ${profile.editionName} Deriver page lacks the note: ${note.text}`);
  }
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
