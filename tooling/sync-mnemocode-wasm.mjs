// MnemoCode's WebAssembly files, one per page (MnemoCode ADR 0007), vendored unchanged into
// packages/recovery-mnemocode-wasm from the release archive mnemocode-<version>-wasm.tar, with the
// licence files of the same commit. source.json records the commit, the archive's SHA-256 and every
// vendored file's SHA-256; --check verifies the folder against it and each profile's modules.json.
//
//   node tooling/sync-mnemocode-wasm.mjs --archive <tar> --source <mnemocode checkout> [--unreleased <phrase>]
//   node tooling/sync-mnemocode-wasm.mjs --check
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isMainScript } from "./run-script.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const MNEMOCODE_WASM_DIRECTORY = "packages/recovery-mnemocode-wasm";
export const MNEMOCODE_WASM_SOURCE = `${MNEMOCODE_WASM_DIRECTORY}/source.json`;
export const MNEMOCODE_REPOSITORY = "hobby-eng/mnemocode";
/** The page profiles wallet-tools embeds; the Dash Community Scanner takes the multi-chain one. */
export const MNEMOCODE_PROFILES = Object.freeze([
  "multi-chain/key-derivation",
  "multi-chain/discovery-scanner",
  "dash-community/key-derivation",
]);
const PROFILE_FILES = Object.freeze(["mnemocode.d.ts", "mnemocode.js", "mnemocode.wasm"]);
const LEGAL_FILES = Object.freeze([
  "LICENSE-APACHE",
  "LICENSE-MIT",
  "NOTICE",
  "THIRD_PARTY_NOTICES.md",
]);
const SHA256 = /^[0-9a-f]{64}$/u;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function option(args, name) {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
}

/** The files of `directory`, relative, sorted; a link or another kind of entry is refused. */
function listFiles(directory) {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => {
      if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory()))
        throw new Error(`MnemoCode WASM: ${entry.name} is not a regular file.`);
      return entry.isFile();
    })
    .map((entry) =>
      relative(directory, resolve(entry.parentPath, entry.name)).replaceAll("\\", "/"),
    )
    .sort();
}

/** Checks a profile folder against its modules.json: profile, files and their SHA-256. */
function checkProfile(folder, profile) {
  const manifest = JSON.parse(readFileSync(resolve(folder, "modules.json"), "utf8"));
  if (manifest.profile !== profile)
    throw new Error(`MnemoCode WASM: ${profile}/modules.json names ${manifest.profile}.`);
  if (!/^\d+\.\d+\.\d+$/u.test(manifest.version) || !/^[0-9a-f]{16}$/u.test(manifest.buildId))
    throw new Error(`MnemoCode WASM: ${profile}/modules.json has no version or build ID.`);
  const listed = Object.keys(manifest.files ?? {}).sort();
  if (JSON.stringify(listed) !== JSON.stringify([...PROFILE_FILES]))
    throw new Error(
      `MnemoCode WASM: ${profile} does not hold exactly ${PROFILE_FILES.join(", ")}.`,
    );
  for (const name of PROFILE_FILES) {
    const actual = sha256(readFileSync(resolve(folder, name)));
    if (actual !== manifest.files[name])
      throw new Error(`MnemoCode WASM: ${profile}/${name} does not match its modules.json.`);
  }
  return manifest;
}

/** Copies the profiles out of `archive` and the licence files of `source`, then writes source.json. */
export function syncMnemoCodeWasm({ archive, source, unreleased, root = ROOT }) {
  const commit = execFileSync("git", ["-C", source, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const dirty = execFileSync("git", ["-C", source, "status", "--porcelain"], { encoding: "utf8" });
  if (dirty !== "") throw new Error("MnemoCode WASM: the source checkout has uncommitted changes.");
  const tag = execFileSync("git", ["-C", source, "tag", "--points-at", "HEAD"], {
    encoding: "utf8",
  })
    .split("\n")
    .find((name) => /^v\d+\.\d+\.\d+$/u.test(name));
  if (tag === undefined && unreleased === undefined)
    throw new Error("MnemoCode WASM: the commit has no release tag; say why with --unreleased.");
  const staging = mkdtempSync(resolve(root, "../tmp/mnemocode-wasm-"));
  try {
    execFileSync("tar", ["--extract", "--file", resolve(archive), "--directory", staging]);
    const target = resolve(root, MNEMOCODE_WASM_DIRECTORY, "generated");
    rmSync(target, { recursive: true, force: true });
    let version;
    for (const profile of MNEMOCODE_PROFILES) {
      const folder = resolve(staging, "wasm", profile);
      const manifest = checkProfile(folder, profile);
      if (version !== undefined && manifest.version !== version)
        throw new Error("MnemoCode WASM: the profiles are of different versions.");
      version = manifest.version;
      cpSync(folder, resolve(target, profile), { recursive: true });
    }
    if (tag !== undefined && tag !== `v${version}`)
      throw new Error(`MnemoCode WASM: tag ${tag} is not version ${version}.`);
    for (const name of LEGAL_FILES)
      cpSync(resolve(source, name), resolve(root, MNEMOCODE_WASM_DIRECTORY, name));
    const files = Object.fromEntries(
      [...LEGAL_FILES, ...listFiles(target).map((path) => `generated/${path}`)].map((path) => [
        path,
        sha256(readFileSync(resolve(root, MNEMOCODE_WASM_DIRECTORY, path))),
      ]),
    );
    const record = {
      schemaVersion: 1,
      repository: MNEMOCODE_REPOSITORY,
      commit,
      version,
      ...(tag === undefined ? { unreleased } : { tag }),
      archive: { name: archive.split("/").at(-1), sha256: sha256(readFileSync(archive)) },
      files,
    };
    writeFileSync(resolve(root, MNEMOCODE_WASM_SOURCE), `${JSON.stringify(record, null, 2)}\n`);
    return record;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

/** The vendored files, source.json first, from the repository root. */
export function mnemocodeWasmFiles(root = ROOT) {
  const record = JSON.parse(readFileSync(resolve(root, MNEMOCODE_WASM_SOURCE), "utf8"));
  return [
    MNEMOCODE_WASM_SOURCE,
    ...Object.keys(record.files)
      .sort()
      .map((path) => `${MNEMOCODE_WASM_DIRECTORY}/${path}`),
  ];
}

/** Verifies the vendored folder against source.json and each profile's modules.json. */
export function checkMnemoCodeWasm(root = ROOT) {
  const record = JSON.parse(readFileSync(resolve(root, MNEMOCODE_WASM_SOURCE), "utf8"));
  if (
    record.repository !== MNEMOCODE_REPOSITORY ||
    !/^[0-9a-f]{40}$/u.test(record.commit ?? "") ||
    !SHA256.test(record.archive?.sha256 ?? "") ||
    (record.tag === undefined) === (record.unreleased === undefined)
  )
    throw new Error("MnemoCode WASM: source.json is incomplete.");
  const folder = resolve(root, MNEMOCODE_WASM_DIRECTORY);
  const present = listFiles(folder).filter(
    (path) => path !== "source.json" && path !== "README.md",
  );
  if (JSON.stringify(present) !== JSON.stringify(Object.keys(record.files).sort()))
    throw new Error("MnemoCode WASM: the folder does not hold exactly the files of source.json.");
  for (const [path, hash] of Object.entries(record.files)) {
    if (
      lstatSync(resolve(folder, path)).isSymbolicLink() ||
      sha256(readFileSync(resolve(folder, path))) !== hash
    )
      throw new Error(`MnemoCode WASM: ${path} does not match source.json.`);
  }
  for (const profile of MNEMOCODE_PROFILES) {
    const manifest = checkProfile(resolve(folder, "generated", profile), profile);
    if (manifest.version !== record.version)
      throw new Error(`MnemoCode WASM: ${profile} is not version ${record.version}.`);
  }
  return record;
}

if (isMainScript(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes("--check")) {
    const record = checkMnemoCodeWasm();
    console.log(`MnemoCode WASM ${record.version} (${record.commit.slice(0, 12)}) verified.`);
  } else {
    const archive = option(args, "--archive");
    const source = option(args, "--source");
    if (archive === undefined || source === undefined)
      throw new Error(
        "Usage: --archive <mnemocode-<version>-wasm.tar> --source <checkout> [--unreleased <phrase>]",
      );
    const record = syncMnemoCodeWasm({ archive, source, unreleased: option(args, "--unreleased") });
    console.log(`Vendored MnemoCode WASM ${record.version} from ${record.commit.slice(0, 12)}.`);
  }
}
