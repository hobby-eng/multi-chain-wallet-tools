import { WASM_CATALOG } from "./wasm-modules.mjs";
import { MhfeIntegrationModules } from "./mhfe-integration.mjs";
import { isMainScript } from "./run-script.mjs";
import { MHFE_MANIFEST_SHA256, VendoredMhfePackage } from "./vendored-mhfe-package.mjs";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MNEMOCODE_FILES,
  MNEMOCODE_MANIFEST,
  MNEMOCODE_SOURCE_DIRECTORY,
  verifyMnemoCodeSource,
} from "./sync-mnemocode-source.mjs";

const defaultRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

// The MnemoCode pin is written by tooling/sync-mnemocode-source.mjs together with the vendored files.
const mnemocodeManifest = JSON.parse(
  readFileSync(resolve(defaultRoot, MNEMOCODE_MANIFEST), "utf8"),
);

export const GITHUB_SOURCES = [
  {
    id: "mnemocode-core",
    repository: mnemocodeManifest.repository,
    reference: `${mnemocodeManifest.version} core, ${mnemocodeManifest.reference}`,
    commit: mnemocodeManifest.commit,
    ...(mnemocodeManifest.unreleased === undefined
      ? {}
      : { unreleased: mnemocodeManifest.unreleased }),
  },
  {
    id: "dash-orchard",
    repository: "dashpay/orchard",
    reference: "dashified-0.14.1",
    commit: "38ac9c19a2df7bf3eeadc22ab23053e8fd538828",
  },
  {
    id: "dash-zcash-note-encryption",
    repository: "dashpay/zcash_note_encryption",
    reference: "9f7e93d",
    commit: "9f7e93d42cef839d02b9d75918117941d453f8cb",
  },
  {
    id: "rust-codex32-0.1.0",
    repository: "apoelstra/rust-codex32",
    reference: "crates.io 0.1.0 VCS revision",
    commit: "305a5b3c1adaae7c3c35492d33946954213f16c7",
  },
  {
    id: "slip39-reference",
    repository: "trezor/python-shamir-mnemonic",
    reference: "source revision used by the local port and official vectors",
    commit: "17fcce14736afe498871d3018e4fa9330443471a",
  },
  {
    id: "seedsigner-seedqr",
    repository: "SeedSigner/seedsigner",
    reference: "SeedQR documentation revision",
    commit: "cfaf443a5f19e3a3e2b2c7be7572ae3924142c0e",
  },
  {
    // The browser package of the signed MHFE v0.6.0 release (mhfe-v0.6.0-browser.tar.gz, SHA-256
    // e7f97d48…, listed in the OpenPGP-signed SHA256SUMS). The Python fast-mode launcher of the
    // package is not vendored: the executable Deriver replaces it.
    id: "mhfe-v0.6.0",
    repository: "hobby-eng/mhfe",
    reference: "v0.6.0 signed release, browser package",
    commit: "66f142566464255e331763966b00ea1681c2dabd",
  },
  {
    id: "sskr-0.12.0",
    repository: "BlockchainCommons/bc-sskr-rust",
    reference: "crates.io 0.12.0 VCS revision",
    commit: "177cd9305c152b6cc1b9768651e65e7d563b4e8e",
  },
  {
    id: "bc-envelope-0.43.0",
    repository: "BlockchainCommons/bc-envelope-rust",
    reference: "crates.io 0.43.0 VCS revision",
    commit: "bae6880035bcd14c0d149d4eb42082b0069edb83",
  },
  {
    id: "bc-components-0.31.1",
    repository: "BlockchainCommons/bc-components-rust",
    reference: "crates.io 0.31.1 VCS revision",
    commit: "d843f5d8f66330eaa4471662d57f5c1bebfd0c7c",
  },
];

/** The same MHFE integration modules that composition gates own. */
function mhfePanelFiles(root) {
  return MhfeIntegrationModules.files(root);
}

/**
 * The Deriver's and the Scanner's own files that bind MnemoCode, found by their names as the MHFE
 * panel's are, so that a new one is never left out of the record (AUD-023-BLD006).
 */
function mnemocodeIntegrationFiles(root) {
  const groups = [
    ["apps/key-derivation/src/ui", (name) => name.startsWith("recovery-mnemocode")],
    ["apps/key-derivation/tests", (name) => name.startsWith("recovery-mnemocode")],
    [
      "apps/key-derivation/src/workers",
      (name) =>
        name.startsWith("mnemocode-") ||
        name === "page-wordlist.ts" ||
        name === "webcrypto-pbkdf2.ts",
    ],
    [
      "packages/recovery-backup/src",
      (name) => name.startsWith("mnemocode") || name.startsWith("self-test-mnemocode"),
    ],
    ["packages/recovery-backup/tests", (name) => name.startsWith("mnemocode")],
    ["apps/discovery-scanner/src", (name) => name.startsWith("candidate-list")],
    ["apps/discovery-scanner/tests", (name) => name.startsWith("candidate-list")],
  ];
  return groups.flatMap(([directory, belongs]) =>
    readdirSync(resolve(root, directory))
      .filter((name) => /\.(?:ts|mjs)$/u.test(name) && belongs(name))
      .sort()
      .map((name) => `${directory}/${name}`),
  );
}

/** Binds the vendored MHFE files to the package's manifest, and the manifest to its pin. */
export function verifyMhfePackage(root, pinnedManifestSha256 = MHFE_MANIFEST_SHA256) {
  new VendoredMhfePackage(root).verify(pinnedManifestSha256);
}

export const LOCAL_IMPLEMENTATIONS = [
  {
    id: "seedqr-codec",
    upstream: "seedsigner-seedqr",
    files: [
      "packages/recovery-backup/src/seedqr.ts",
      "packages/recovery-backup/tests/seedqr.test.ts",
    ],
  },
  {
    id: "mnemocode-codec",
    upstream: "mnemocode-core",
    files: [
      MNEMOCODE_MANIFEST,
      ...Object.values(MNEMOCODE_FILES).map((path) => `${MNEMOCODE_SOURCE_DIRECTORY}/${path}`),
      ...mnemocodeIntegrationFiles(defaultRoot),
    ],
  },
  {
    id: "mhfe-browser-module",
    upstream: "mhfe-v0.6.0",
    files: [...new VendoredMhfePackage(defaultRoot).files(), ...mhfePanelFiles(defaultRoot)],
  },
  {
    id: "slip39-codec",
    upstream: "slip39-reference",
    files: [
      "packages/recovery-backup/src/slip39.ts",
      "packages/recovery-backup/src/slip39-wordlist.ts",
      "packages/recovery-backup/tests/slip39-official-vectors.json",
      "packages/recovery-backup/tests/slip39.test.ts",
    ],
  },
  {
    id: "codex32-codec",
    upstream: "rust-codex32-0.1.0",
    files: [
      "packages/recovery-codex32-wasm/rust/src/lib.rs",
      "packages/recovery-backup/src/codex32.ts",
      "packages/recovery-backup/tests/codex32.test.ts",
      "packages/recovery-backup/tests/fixtures/bip93-vectors.json",
    ],
  },
  {
    id: "sskr-codec",
    upstream: "sskr-0.12.0",
    files: [
      "packages/recovery-sskr-wasm/rust/src/lib.rs",
      "packages/recovery-backup/src/sskr.ts",
      "packages/recovery-backup/src/sskr-codec.ts",
      "packages/recovery-backup/src/self-test-sskr.ts",
    ],
  },
  {
    id: "gordian-seed-envelope",
    upstream: "bc-envelope-0.43.0",
    files: [
      "packages/recovery-envelope-wasm/rust/src/lib.rs",
      "packages/recovery-backup/src/gordian-envelope.ts",
      "packages/recovery-backup/src/self-test-gordian-envelope.ts",
    ],
  },
  {
    id: "qr-render-and-decode",
    upstream: null,
    files: [
      "packages/shared-ui/src/payment-qr.ts",
      "packages/shared-ui/src/qr-image-import.ts",
      "packages/shared-ui/src/qr-image-import.test.ts",
    ],
  },
];

/** SHA-256 of the MHFE package manifest, generated/modules.json, which pins every other file. */

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function packageBlocks(lockfile) {
  const start = lockfile.indexOf("\npackages:\n");
  const end = lockfile.indexOf("\nsnapshots:\n", start);
  if (start < 0 || end < 0) throw new Error("pnpm-lock.yaml is missing packages or snapshots.");
  const section = lockfile.slice(start + "\npackages:\n".length, end);
  return [...section.matchAll(/^  (\S[^\n]*):\n([\s\S]*?)(?=^  \S[^\n]*:\n|\s*$)/gmu)];
}

export function verifyPnpmLock(lockfile) {
  const blocks = packageBlocks(lockfile);
  if (blocks.length === 0) throw new Error("pnpm-lock.yaml contains no external packages.");
  for (const [, name, body] of blocks) {
    if (!/resolution: \{integrity: sha512-[A-Za-z0-9+/]+={0,2}\}/u.test(body)) {
      throw new Error("pnpm dependency is missing a pinned SHA-512 integrity value: " + name);
    }
  }
  return blocks.length;
}

export function verifyCargoLock(lockfile, label) {
  const blocks = lockfile
    .split(/^\[\[package\]\]\s*$/mu)
    .slice(1)
    .map((body) => [undefined, body]);
  let external = 0;
  for (const [, body] of blocks) {
    const name = /^name = "([^"]+)"/mu.exec(body)?.[1] ?? "unknown";
    const source = /^source = "([^"]+)"/mu.exec(body)?.[1];
    if (source === undefined) continue;
    external += 1;
    if (source.startsWith("registry+")) {
      if (!/^checksum = "[a-f0-9]{64}"$/mu.test(body))
        throw new Error(label + " registry crate is missing its SHA-256 checksum: " + name);
    } else if (source.startsWith("git+")) {
      if (!/#[a-f0-9]{40}$/u.test(source))
        throw new Error(label + " git crate is not pinned to a full commit: " + name);
    } else {
      throw new Error(label + " uses an unsupported external Cargo source: " + source);
    }
  }
  if (external === 0) throw new Error(label + " contains no external Cargo packages.");
  return external;
}

async function checkGithubSource(source, fetchImpl, timeoutMs) {
  const url = "https://api.github.com/repos/" + source.repository + "/commits/" + source.commit;
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "ckd-provenance-check" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok)
      return {
        ...source,
        status: "unavailable",
        detail: "GitHub returned HTTP " + response.status,
      };
    const payload = await response.json();
    if (payload.sha !== source.commit) {
      throw new Error(
        "GitHub provenance mismatch for " +
          source.id +
          ": expected " +
          source.commit +
          ", received " +
          String(payload.sha),
      );
    }
    return { ...source, status: "verified", detail: "Exact commit is available from GitHub." };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("GitHub provenance mismatch"))
      throw error;
    return {
      ...source,
      status: "unavailable",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * An upstream marked `unreleased` was vendored from a local, unpublished build at the owner's
 * request. Local builds go on with a warning; CI and the reproducible container (both set CI=true)
 * refuse, so that no release carries an upstream that cannot be checked.
 */
export function assertReleasedUpstreams(
  logger,
  sources = GITHUB_SOURCES,
  ci = process.env.CI === "true",
) {
  const unreleased = sources.filter((source) => source.unreleased !== undefined);
  for (const source of unreleased)
    logger.warn(
      `WARNING: ${source.id} is ${source.unreleased}. Vendor its published release before any release of these tools.`,
    );
  if (unreleased.length > 0 && ci)
    throw new Error(
      `Unreleased upstream sources cannot be built in CI: ${unreleased.map((source) => source.id).join(", ")}.`,
    );
}

export async function verifyDependencyProvenance({
  root = defaultRoot,
  fetchImpl = fetch,
  timeoutMs = 5000,
  writeReport = true,
  verifyFixedSources = true,
  logger = console,
} = {}) {
  if (verifyFixedSources) {
    verifyMnemoCodeSource({ root });
    verifyMhfePackage(root);
  }
  const pnpmPackages = verifyPnpmLock(readFileSync(resolve(root, "pnpm-lock.yaml"), "utf8"));
  const cargoLockPaths = WASM_CATALOG.nativeCrates().map(({ lockPath }) => lockPath);
  const cargoPackages = cargoLockPaths.reduce(
    (count, path) => count + verifyCargoLock(readFileSync(resolve(root, path), "utf8"), path),
    0,
  );
  const localSources = LOCAL_IMPLEMENTATIONS.map((entry) => ({
    ...entry,
    files: entry.files.map((path) => ({ path, sha256: sha256(readFileSync(resolve(root, path))) })),
  }));
  const github = await Promise.all(
    GITHUB_SOURCES.map((source) => checkGithubSource(source, fetchImpl, timeoutMs)),
  );
  for (const result of github) {
    if (result.status === "unavailable") {
      logger.warn(
        "WARNING: upstream commit availability verification was unavailable for " +
          result.id +
          " (" +
          result.commit +
          "): " +
          result.detail +
          ". Package-manager integrity pins remain mandatory, and local source hashes are recorded in the verification evidence.",
      );
    }
  }
  assertReleasedUpstreams(logger);
  const report = {
    schemaVersion: 1,
    lockedDependencies: {
      pnpmPackages,
      cargoPackages,
      policy:
        "Every pnpm archive has a SHA-512 integrity pin; every crates.io archive has a SHA-256 checksum; every Cargo git source has a full commit pin.",
    },
    github,
    localSources,
  };
  if (writeReport) {
    const target = resolve(root, "dist/dependency-provenance.json");
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, JSON.stringify(report, null, 2) + "\n");
  }
  logger.log(
    "Validated package-manager integrity pins for " +
      pnpmPackages +
      " pnpm packages and " +
      cargoPackages +
      " Cargo packages; GitHub exact commits verified " +
      github.filter((item) => item.status === "verified").length +
      "/" +
      github.length +
      ".",
  );
  return report;
}

if (isMainScript(import.meta.url)) {
  await verifyDependencyProvenance();
}
