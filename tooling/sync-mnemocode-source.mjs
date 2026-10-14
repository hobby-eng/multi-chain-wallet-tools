import { isMainScript } from "./run-script.mjs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Vendors the MnemoCode core from its public Git repository.
 *
 * Builds never download MnemoCode: this command is run deliberately, writes
 * reviewed source files plus a manifest of their SHA-256 values, and the result is
 * committed. `--check` verifies the committed files offline; the build's provenance
 * check (verify-dependency-provenance.mjs) runs the same check and only asks GitHub
 * whether the pinned commit exists.
 *
 * Two groups are imported: the host-neutral library (transformations, records,
 * searches, wallet evidence, candidate lists, Shamir share sets and their repair,
 * backup checks), and the card, share-card and heir-sheet renderers with their font
 * and artwork. MnemoCode's CLI, file output, SSKR engine and WASM, QR reader and PNG
 * coder are never vendored: the library and renderers receive those services from
 * the host through MnemoCode's platform interfaces, and the Derivation Tool supplies
 * them from components it already has.
 *
 * `--working-tree <path>` copies the files from a local MnemoCode checkout instead,
 * uncommitted changes included, when the owner asks for the newest state before it
 * is pushed. The manifest then marks the source unreleased, which the provenance
 * check turns into a refusal in CI.
 */

const defaultRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export const MNEMOCODE_REPOSITORY = "hobby-eng/mnemocode";
export const MNEMOCODE_SOURCE_DIRECTORY = "packages/recovery-mnemocode/source";
export const MNEMOCODE_MANIFEST = "packages/recovery-mnemocode/source.json";

/** Card renderers, used only by the optional mnemocode-cards feature. */
export const MNEMOCODE_CARD_FILES = Object.freeze({
  "src/cards.ts": "cards.ts",
  ...Object.fromEntries(
    [
      "business-artwork",
      "business-cards",
      "business-designs",
      "business-layout",
      "business-render-primitives",
      "business-tint",
      "card-codes",
      "card-content",
      "card-decoys",
      "card-drawing",
      "card-copy",
      "card-renderer",
      "card-identities",
      "card-palette",
      "card-plan",
      "card-preview",
      "cards-self-test",
      "card-sets-self-test",
      "card-qr",
      "card-session",
      "card-settings",
      "collection-sheet",
      "color-math",
      "document-metadata",
      "export-details",
      "heir-sheet",
      "heir-sheet-self-test",
      "heir-sheet-text",
      "material-artwork",
      "material-cards",
      "pdf-documents",
      "platform",
      "render",
      "self-test-cards",
      "sskr-content",
      "sskr-render",
      "sskr-render-self-test",
      "study-backdrops",
      "templates",
      "world-map",
      "world-map-data",
      "backup-cards",
      "document-formats",
      "page-units",
      "sskr-keeping-text",
      "template-catalog",
    ].map((name) => [`src/export/${name}.ts`, `export/${name}.ts`]),
  ),
  // Share text validation used by the renderers; the sharing engine is not imported.
  "src/sskr/bytewords-list.ts": "sskr/bytewords-list.ts",
  "src/sskr/transport.ts": "sskr/transport.ts",
  ...Object.fromEntries(
    [
      "fonts/DejaVuSans-NOTICE",
      "fonts/DejaVuSans-UI.ttf",
      // Notice for the public-domain map data behind world-map-data.ts.
      "maps/NOTICE",
      "images/business-architect-v1.png",
      "images/business-contact-v1.png",
      "images/business-curves-v1.png",
      "images/business-diagonal-v1.png",
      "images/business-estate-v1.png",
      "images/business-facets-v1.png",
      "images/business-it-v1.png",
      "images/material-enclosure.jpg",
      "images/material-kitchen.jpg",
      "images/material-switch.jpg",
      "images/material-tile.jpg",
      "images/material-vehicle.jpg",
    ].map((name) => [`assets/${name}`, `assets/${name}`]),
  ),
});

/** The host-neutral library: every module below is importable on its own in a browser. */
export const MNEMOCODE_LIBRARY_FILES = Object.freeze({
  "src/core.ts": "core.ts",
  ...Object.fromEntries(
    [
      "address-scan",
      "backup-check",
      "backup-check-self-test",
      "backup-options",
      "backup-reading",
      "backup-reading-self-test",
      "bip32-limits",
      "bip39-sizes",
      "bits",
      "byte-units",
      "candidate-encryption",
      "candidate-encryption-self-test",
      "candidate-file-admission",
      "candidate-file-refusal",
      "candidate-list",
      "candidate-list-self-test",
      "candidate-list-writer",
      "candidates",
      "candidates-self-test",
      "coin-address-evidence",
      "code-text",
      "coins",
      "coins-self-test",
      "colors",
      "date-recovery",
      "date-search",
      "date-search-self-test",
      "dates",
      "encoded-backup",
      "encoded-form",
      "english-words",
      "masking",
      "missing-codes",
      "missing-codes-search",
      "places",
      "pieces",
      "prose",
      "png-admission",
      "redacted",
      "re-encoding",
      "re-encoding-self-test",
      "refusal",
      "representations",
      "representations-self-test",
      "search-turns",
      "search-plan",
      "seedshift",
      "self-test",
      "self-test-check",
      "typed-number",
      "types",
      "wallet-check",
      "master-fingerprint",
      "master-fingerprint-self-test",
      "wallet-evidence",
      "wallet-evidence-self-test",
      "white-space",
      "word-hints",
      "word-hints-self-test",
      "words",
      // Each coin family is its own module, so that a one-coin edition takes only its own.
      "coins/address-types",
      "coins/address-sizes",
      "coins/base58",
      "coins/base58-check",
      "coins/bech32",
      "coins/bitcoin-cash",
      "coins/bitcoin-cash-self-test",
      "coins/bitcoin-like",
      "coins/bitcoin-like-self-test",
      "coins/bitcoin-versions",
      "coins/coin",
      "coins/coin-self-test",
      "coins/cosmos",
      "coins/cosmos-self-test",
      "coins/dash",
      "coins/dash-self-test",
      "coins/evm",
      "coins/ethereum",
      "coins/ethereum-self-test",
      "coins/evm-self-test",
      "coins/keccak-account",
      "coins/other-forms",
      "coins/taproot",
      "coins/xrp",
      "coins/xrp-self-test",
    ].map((name) => [`src/core/${name}.ts`, `core/${name}.ts`]),
  ),
  ...Object.fromEntries(
    [
      "checksum",
      "complete-shares",
      "gf2",
      "gf256",
      "joint-repair",
      "mixed-layout",
      "known-answers",
      "repair",
      "repair-report",
      "repair-self-test",
      "share-input",
      "share-restore",
      "set-topology",
      "share-layout",
      "share-platform",
      "share-set",
      "share-unmasking",
      "share-unmasking-self-test",
      "share-units",
      "split",
    ].map((name) => [`src/sskr/${name}.ts`, `sskr/${name}.ts`]),
  ),
  "src/record.ts": "record.ts",
  "src/bundled-file-paths.ts": "bundled-file-paths.ts",
  // The public vectors that the self-test checks; the page bundles them as JSON.
  "vectors/mnemocode-v1.json": "vectors/mnemocode-v1.json",
});

/** Upstream path -> vendored path below MNEMOCODE_SOURCE_DIRECTORY. */
export const MNEMOCODE_FILES = Object.freeze({
  ...MNEMOCODE_CARD_FILES,
  ...MNEMOCODE_LIBRARY_FILES,
  LICENSE: "LICENSE",
  NOTICE: "NOTICE",
});

/** Packages the vendored files are compiled against; each resolves to this project's own pin. */
export const SHARED_DEPENDENCIES = Object.freeze([
  "@scure/base",
  "@scure/bip39",
  "@scure/bip32",
  "@scure/btc-signer",
  "@noble/curves",
  "@noble/hashes",
  "age-encryption",
  "pdf-lib",
  "@pdf-lib/fontkit",
]);
/** Every other module specifier would duplicate or add a dependency. */
const ALLOWED_PACKAGE_IMPORTS = new Set([
  "@scure/base",
  "@scure/bip39",
  "@scure/bip39/wordlists/english.js",
  "@scure/bip39/wordlists/traditional-chinese.js",
  "@scure/bip32",
  "@scure/btc-signer",
  "@noble/curves/secp256k1.js",
  "@noble/hashes/sha2.js",
  // Keccak for the EVM and Tron addresses, RIPEMD-160 for HASH160 (coin addresses).
  "@noble/hashes/sha3.js",
  "@noble/hashes/legacy.js",
  "age-encryption",
  "pdf-lib",
  "@pdf-lib/fontkit",
]);

function sharedVersions(packageJson) {
  return Object.fromEntries(
    SHARED_DEPENDENCIES.map((name) => [name, packageJson.dependencies?.[name]]),
  );
}

function assertSameSharedVersions(reviewed, local, label) {
  for (const name of SHARED_DEPENDENCIES) {
    if (reviewed?.[name] === undefined || reviewed[name] !== local[name]) {
      throw new Error(
        `${label} uses ${name} ${reviewed?.[name]}, but this project pins ${local[name]}. ` +
          "The vendored files are compiled against the local copy, so both versions must match.",
      );
    }
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Commit of every reference in `git ls-remote` output.
 *
 * An annotated or signed tag is listed twice: once with the identifier of the tag
 * itself and once, with the suffix `^{}`, with the commit it points to. The commit wins.
 */
export function referencedCommits(lsRemoteOutput) {
  const commits = new Map();
  for (const line of lsRemoteOutput.split("\n")) {
    const match = /^([0-9a-f]{40})\t(\S+?)(\^\{\})?$/u.exec(line.trim());
    if (match === null) continue;
    const [, identifier, reference, peeled] = match;
    if (peeled !== undefined || !commits.has(reference)) commits.set(reference, identifier);
  }
  return commits;
}

/** Highest `vMAJOR.MINOR.PATCH` tag; pre-release and malformed tags are ignored. */
export function selectReleaseTag(lsRemoteOutput) {
  const tags = [...referencedCommits(lsRemoteOutput)]
    .map(([reference, commit]) => ({
      commit,
      match: /^refs\/tags\/(v?(\d+)\.(\d+)\.(\d+))$/u.exec(reference),
    }))
    .filter(({ match }) => match !== null)
    .map(({ commit, match }) => ({
      commit,
      reference: match[1],
      version: [Number(match[2]), Number(match[3]), Number(match[4])],
    }));
  tags.sort(
    (left, right) =>
      right.version[0] - left.version[0] ||
      right.version[1] - left.version[1] ||
      right.version[2] - left.version[2],
  );
  return tags[0];
}

export function importedSpecifiers(source) {
  return [...source.matchAll(/\b(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/gu)]
    .map((match) => match[1])
    .concat(
      [...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gu)].map((match) => match[1]),
    )
    .concat([...source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gmu)].map((match) => match[1]));
}

/** Rejects Node built-ins, other packages and paths that leave the vendored core. */
export function assertAllowedImports(vendoredPath, source) {
  const known = new Set(Object.values(MNEMOCODE_FILES));
  for (const specifier of importedSpecifiers(source)) {
    if (ALLOWED_PACKAGE_IMPORTS.has(specifier)) continue;
    if (!specifier.startsWith(".")) {
      throw new Error(
        `MnemoCode ${vendoredPath} imports ${specifier}. Only ${SHARED_DEPENDENCIES.join(", ")} may be shared; ` +
          "no additional dependency may be introduced through the vendored core.",
      );
    }
    const target = relative(
      "/",
      resolve("/", dirname(vendoredPath), specifier.replace(/\.js$/u, ".ts")),
    );
    if (!known.has(target)) {
      throw new Error(
        `MnemoCode ${vendoredPath} imports ${specifier}, which is outside the vendored core.`,
      );
    }
  }
}

/**
 * A full commit identifier is accepted only when `main` contains it.
 *
 * GitHub serves the files of any commit in the network of a repository, including
 * commits that exist only in a fork. Asking for the difference to `main` tells them apart:
 * `main` is ahead of, or identical to, each of its own commits.
 */
export async function assertCommitOnMain(commit, fetchImpl) {
  const url = `https://api.github.com/repos/${MNEMOCODE_REPOSITORY}/compare/${commit}...main`;
  const response = await fetchImpl(url, {
    headers: { accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok)
    throw new Error(
      `Commit ${commit} was not found in ${MNEMOCODE_REPOSITORY}: HTTP ${response.status}.`,
    );
  const { status } = await response.json();
  if (status !== "ahead" && status !== "identical")
    throw new Error(`Commit ${commit} is not part of the main branch of ${MNEMOCODE_REPOSITORY}.`);
}

async function resolveUpstreamCommit(reference, fetchImpl) {
  const url = `https://github.com/${MNEMOCODE_REPOSITORY}.git`;
  const git = (args) =>
    execFileSync("git", ["ls-remote", ...args], { encoding: "utf8", timeout: 60_000 }).trim();
  if (reference !== undefined) {
    if (/^[0-9a-f]{40}$/u.test(reference)) {
      await assertCommitOnMain(reference, fetchImpl);
      return { reference, commit: reference };
    }
    const commits = referencedCommits(
      git([url, `refs/tags/${reference}`, `refs/heads/${reference}`]),
    );
    const commit = commits.get(`refs/tags/${reference}`) ?? commits.get(`refs/heads/${reference}`);
    if (commit === undefined)
      throw new Error(`MnemoCode reference ${reference} was not found on GitHub.`);
    return { reference, commit };
  }
  const tag = selectReleaseTag(git(["--tags", url]));
  if (tag !== undefined) return { reference: tag.reference, commit: tag.commit };
  const main = referencedCommits(git([url, "refs/heads/main"])).get("refs/heads/main");
  if (main === undefined) throw new Error("MnemoCode has neither a release tag nor a main branch.");
  return { reference: "main", commit: main };
}

async function fetchFile(commit, path, fetchImpl) {
  const url = `https://raw.githubusercontent.com/${MNEMOCODE_REPOSITORY}/${commit}/${path}`;
  let failure;
  // A short retry covers transient connection failures; an HTTP error is final.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, { signal: AbortSignal.timeout(60_000) });
    } catch (cause) {
      failure = cause;
      continue;
    }
    if (!response.ok)
      throw new Error(`Could not download ${path} at ${commit}: HTTP ${response.status}.`);
    return Buffer.from(await response.arrayBuffer());
  }
  throw new Error(`Could not download ${path} at ${commit}.`, { cause: failure });
}

function vendoredFiles(root) {
  const base = resolve(root, MNEMOCODE_SOURCE_DIRECTORY);
  if (!existsSync(base)) return [];
  return readdirSync(base, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(base, resolve(entry.parentPath, entry.name)).replaceAll("\\", "/"))
    .sort();
}

/** Offline gate: committed files, manifest hashes, import allowlist and shared dependency version. */
export function verifyMnemoCodeSource({ root = defaultRoot } = {}) {
  const manifest = JSON.parse(readFileSync(resolve(root, MNEMOCODE_MANIFEST), "utf8"));
  if (manifest.repository !== MNEMOCODE_REPOSITORY)
    throw new Error("MnemoCode manifest names another repository.");
  if (!/^[0-9a-f]{40}$/u.test(manifest.commit ?? "")) {
    throw new Error("MnemoCode manifest must pin a full commit.");
  }
  const expected = Object.values(MNEMOCODE_FILES).sort();
  const listed = Object.keys(manifest.files ?? {}).sort();
  const present = vendoredFiles(root);
  if (
    JSON.stringify(listed) !== JSON.stringify(expected) ||
    JSON.stringify(present) !== JSON.stringify(expected)
  ) {
    throw new Error("The vendored MnemoCode core must contain exactly the reviewed file set.");
  }
  for (const path of expected) {
    const bytes = readFileSync(resolve(root, MNEMOCODE_SOURCE_DIRECTORY, path));
    if (sha256(bytes) !== manifest.files[path]) {
      throw new Error(`Vendored MnemoCode file ${path} does not match its pinned SHA-256.`);
    }
    if (path.endsWith(".ts")) assertAllowedImports(path, bytes.toString("utf8"));
  }
  assertSameSharedVersions(
    manifest.sharedDependencies,
    sharedVersions(JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"))),
    "The vendored MnemoCode revision",
  );
  return manifest;
}

/**
 * The files of a local MnemoCode checkout, uncommitted changes included, with the commit they
 * stand on. Reading from disk replaces the download; every other check stays the same.
 */
function workingTreeSource(path) {
  const commit = execFileSync("git", ["-C", path, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const changed = execFileSync("git", ["-C", path, "status", "--porcelain"], {
    encoding: "utf8",
  }).trim();
  return {
    upstream: { reference: `working tree on ${commit.slice(0, 7)}`, commit },
    unreleased:
      changed === ""
        ? "a local checkout of a commit that may not be pushed"
        : "a copy of an uncommitted local working tree, not a pushed commit",
    read: async (upstreamPath) => readFileSync(resolve(path, upstreamPath)),
  };
}

export async function syncMnemoCodeSource({
  root = defaultRoot,
  reference,
  workingTree,
  fetchImpl = fetch,
  logger = console,
} = {}) {
  const local = workingTree === undefined ? undefined : workingTreeSource(workingTree);
  const upstream = local?.upstream ?? (await resolveUpstreamCommit(reference, fetchImpl));
  const download = local?.read ?? ((path) => fetchFile(upstream.commit, path, fetchImpl));
  const upstreamPackage = JSON.parse((await download("package.json")).toString("utf8"));
  const shared = sharedVersions(upstreamPackage);
  assertSameSharedVersions(
    shared,
    sharedVersions(JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"))),
    `MnemoCode ${upstream.reference}`,
  );
  const downloaded = [];
  for (const [upstreamPath, vendoredPath] of Object.entries(MNEMOCODE_FILES)) {
    const bytes = await download(upstreamPath);
    if (vendoredPath.endsWith(".ts")) assertAllowedImports(vendoredPath, bytes.toString("utf8"));
    downloaded.push({ upstreamPath, vendoredPath, bytes });
  }
  // Replace the directory only after every file was fetched and checked.
  const base = resolve(root, MNEMOCODE_SOURCE_DIRECTORY);
  rmSync(base, { recursive: true, force: true });
  const files = {};
  for (const { vendoredPath, bytes } of downloaded) {
    const target = resolve(base, vendoredPath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    files[vendoredPath] = sha256(bytes);
  }
  const manifest = {
    schemaVersion: 1,
    repository: MNEMOCODE_REPOSITORY,
    reference: upstream.reference,
    commit: upstream.commit,
    version: upstreamPackage.version,
    sharedDependencies: shared,
    ...(local === undefined ? {} : { unreleased: local.unreleased }),
    excluded: "CLI, file and image output, SSKR engine and WASM, QR reader and writer, PNG coder",
    files: Object.fromEntries(
      Object.entries(files).sort(([left], [right]) => left.localeCompare(right)),
    ),
  };
  writeFileSync(resolve(root, MNEMOCODE_MANIFEST), JSON.stringify(manifest, null, 2) + "\n");
  verifyMnemoCodeSource({ root });
  logger.log(
    `Vendored MnemoCode ${manifest.version} from ${upstream.reference} (${upstream.commit}): ` +
      `${Object.keys(files).length} files.`,
  );
  return manifest;
}

if (isMainScript(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes("--check")) {
    const manifest = verifyMnemoCodeSource();
    console.log(
      `Verified vendored MnemoCode ${manifest.version} at ${manifest.reference} (${manifest.commit}).`,
    );
  } else {
    const index = args.indexOf("--ref");
    const reference = index >= 0 ? args[index + 1] : undefined;
    if (index >= 0 && reference === undefined)
      throw new Error("--ref requires a tag, branch or full commit.");
    const treeIndex = args.indexOf("--working-tree");
    const workingTree = treeIndex >= 0 ? resolve(args[treeIndex + 1] ?? "") : undefined;
    if (treeIndex >= 0 && args[treeIndex + 1] === undefined)
      throw new Error("--working-tree requires the path of a MnemoCode checkout.");
    await syncMnemoCodeSource({ reference, workingTree });
  }
}
