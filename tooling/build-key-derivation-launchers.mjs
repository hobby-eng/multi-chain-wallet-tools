import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { basename, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseBuildProfile } from "./build-profiles.mjs";
import {
  assertLauncherFileEmbedsPage,
  CONTAINER_PLATFORMS,
  findLaunchers,
  LAUNCHER_PLATFORMS,
  launcherName,
} from "./key-derivation-launchers.mjs";

// Builds the executable Key Derivation Tool for a profile's deriver page, which must already be
// built. Usage:
//   node tooling/build-key-derivation-launchers.mjs [--profile multi-chain] [--platforms <list>]
// <list> is "host" (the default: this computer), "container" (what Dockerfile.launchers builds)
// or platform names separated by commas, such as linux-x86_64,windows-x86_64.

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dist = resolve(root, "dist");
const crate = resolve(root, "apps/key-derivation/launcher");
const profile = parseBuildProfile();

function requestedPlatforms() {
  const index = process.argv.indexOf("--platforms");
  const inline = process.argv.find((argument) => argument.startsWith("--platforms="));
  const value =
    inline?.slice("--platforms=".length) ?? (index >= 0 ? process.argv[index + 1] : "host");
  if (value === "host") return [hostPlatform()];
  if (value === "container") return [...CONTAINER_PLATFORMS];
  const platforms = (value ?? "").split(",").filter((platform) => platform !== "");
  for (const platform of platforms) {
    if (!Object.hasOwn(LAUNCHER_PLATFORMS, platform)) {
      throw new Error(
        `Unknown platform "${platform}". Expected: ${Object.keys(LAUNCHER_PLATFORMS).join(", ")}.`,
      );
    }
  }
  if (platforms.length === 0) throw new Error("--platforms needs at least one platform.");
  return platforms;
}

function hostPlatform() {
  const system = { linux: "linux", win32: "windows", darwin: "macos" }[process.platform];
  const machine = { x64: "x86_64", arm64: "aarch64" }[process.arch];
  const platform = `${system}-${machine}`;
  if (!Object.hasOwn(LAUNCHER_PLATFORMS, platform)) {
    throw new Error(
      `No launcher is defined for this computer (${process.platform} ${process.arch}).`,
    );
  }
  return platform;
}

/** The page's SHA-256, after checking it against the sidecar the HTML build wrote. */
function verifiedPageDigest(page) {
  if (!existsSync(page) || !existsSync(`${page}.sha256`)) {
    throw new Error(
      `${relative(root, page)} or its .sha256 file is missing. Build the HTML first.`,
    );
  }
  const digest = createHash("sha256").update(readFileSync(page)).digest("hex");
  if (readFileSync(`${page}.sha256`, "utf8").trim() !== `${digest}  ${basename(page)}`) {
    throw new Error(`The .sha256 file next to ${relative(root, page)} does not match the page.`);
  }
  return digest;
}

const { page } = findLaunchers(dist, profile);
const digest = verifiedPageDigest(page);
for (const platform of requestedPlatforms()) {
  const { target, extension } = LAUNCHER_PLATFORMS[platform];
  const result = spawnSync(
    process.env.CARGO ?? "cargo",
    [
      "build",
      "--release",
      "--locked",
      "--offline",
      "--manifest-path",
      resolve(crate, "Cargo.toml"),
      "--target",
      target,
    ],
    {
      cwd: root,
      env: { ...process.env, DERIVER_PAGE: page, DERIVER_PAGE_SHA256: digest },
      stdio: "inherit",
    },
  );
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  const output = resolve(crate, "target", target, "release", `key-derivation-launcher${extension}`);
  const destination = resolve(page, "..", launcherName(basename(page), platform));
  copyFileSync(output, destination);
  assertLauncherFileEmbedsPage(destination, page);
  const launcherDigest = createHash("sha256").update(readFileSync(destination)).digest("hex");
  console.log(`Built ${relative(root, destination)}`);
  console.log(`SHA-256 ${launcherDigest}`);
}
