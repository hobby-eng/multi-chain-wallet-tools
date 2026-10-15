/** Import an exact local MnemoCode bridge closure without claiming a wallet-tools rebuild. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isMainScript } from "./run-script.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIRECTORY = "packages/recovery-sskr-wasm";
const PIN_FILES = Object.freeze([
  "rust/Cargo.lock",
  "rust/Cargo.toml",
  "rust/clippy.toml",
  "rust/rust-toolchain.toml",
  "rust/src/lib.rs",
  "rust/src/refusal.rs",
  "generated/recovery_sskr_wasm.js",
  "generated/recovery_sskr_wasm.d.ts",
  "generated/recovery_sskr_wasm_bg.wasm",
  "generated/recovery_sskr_wasm_bg.wasm.d.ts",
]);
const NOTICES = Object.freeze(["LICENSE", "NOTICE.md", "UPSTREAM_NOTICES.md"]);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Owns source/asset pin verification and copying; the canonical container gate stays separate. */
export class MnemoCodeSskrSource {
  #root;

  constructor(root = ROOT) {
    this.#root = root;
  }

  /** Refuses drift of any imported input, notice, bridge version or integrity pin. */
  verify() {
    const base = resolve(this.#root, DIRECTORY);
    const manifest = JSON.parse(readFileSync(resolve(base, "source.json"), "utf8"));
    const pins = JSON.parse(readFileSync(resolve(base, "integrity.json"), "utf8"));
    if (
      manifest.repository !== "hobby-eng/mnemocode" ||
      !/^[0-9a-f]{64}$/u.test(manifest.sourceFingerprint ?? "")
    )
      throw new Error("Imported SSKR source identity is missing or unsupported.");
    if (
      JSON.stringify(Object.keys(manifest.files).sort()) !==
      JSON.stringify([...PIN_FILES, ...NOTICES, "integrity.json"].sort())
    )
      throw new Error("Imported SSKR source file set differs from the reviewed closure.");
    if (JSON.stringify(Object.keys(pins).sort()) !== JSON.stringify([...PIN_FILES].sort()))
      throw new Error("The MnemoCode bridge must retain its exact ten-pin closure.");
    for (const file of [...PIN_FILES, ...NOTICES, "integrity.json"]) {
      const actual = hash(readFileSync(resolve(base, file)));
      if (actual !== manifest.files[file] || (Object.hasOwn(pins, file) && actual !== pins[file]))
        throw new Error(`Imported SSKR input differs from its source pin: ${file}`);
    }
    const version = JSON.parse(readFileSync(resolve(base, "package.json"), "utf8")).version;
    const cargo = readFileSync(resolve(base, "rust/Cargo.toml"), "utf8");
    if (version !== manifest.version || !cargo.includes(`version = "${version}"`))
      throw new Error("Imported SSKR package and bridge versions disagree.");
    return manifest;
  }

  /** Copies only the frozen handover inputs, validating everything before writing anything. */
  sync(workingTree, sourceManifest) {
    const incoming = JSON.parse(readFileSync(sourceManifest, "utf8"));
    const sourcePins = new Map(incoming.files.map(({ path, sha256 }) => [path, sha256]));
    const base = resolve(workingTree, "sskr-wasm");
    const files = [...PIN_FILES, ...NOTICES, "integrity.json"].map((file) => {
      const bytes = readFileSync(resolve(base, file));
      if (hash(bytes) !== sourcePins.get(`sskr-wasm/${file}`))
        throw new Error(`MnemoCode handover input changed: ${file}`);
      return { file, bytes, sha256: hash(bytes) };
    });
    const integrity = files.find(({ file }) => file === "integrity.json");
    if (integrity === undefined) throw new Error("Bridge integrity pins are missing.");
    const pins = JSON.parse(integrity.bytes.toString("utf8"));
    if (JSON.stringify(Object.keys(pins).sort()) !== JSON.stringify([...PIN_FILES].sort()))
      throw new Error("Unsupported bridge integrity pin set.");
    for (const entry of files)
      if (Object.hasOwn(pins, entry.file) && pins[entry.file] !== entry.sha256)
        throw new Error(`MnemoCode bridge input does not match integrity.json: ${entry.file}`);
    const cargo = files.find(({ file }) => file === "rust/Cargo.toml");
    const version = cargo?.bytes.toString("utf8").match(/^version = "([^"]+)"$/mu)?.[1];
    if (version === undefined) throw new Error("Bridge package version is missing.");
    const target = resolve(this.#root, DIRECTORY);
    for (const { file, bytes } of files) {
      const path = resolve(target, file);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, bytes);
    }
    const packagePath = resolve(target, "package.json");
    const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
    writeFileSync(packagePath, JSON.stringify({ ...pkg, version }, null, 2) + "\n");
    writeFileSync(
      resolve(target, "source.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          repository: "hobby-eng/mnemocode",
          sourceFingerprint: incoming.fingerprint,
          version,
          unreleased: "Imported from a frozen uncommitted local MnemoCode handover.",
          canonicalWalletToolsComparison: "Not run; the existing canonical gate remains mandatory.",
          files: Object.fromEntries(files.map(({ file, sha256 }) => [file, sha256])),
        },
        null,
        2,
      ) + "\n",
    );
    return this.verify();
  }
}

if (isMainScript(import.meta.url)) {
  const [operation, workingTree, manifest] = process.argv.slice(2);
  const source = new MnemoCodeSskrSource();
  if (operation === "--check") source.verify();
  else if (operation === "--working-tree" && workingTree !== undefined && manifest !== undefined)
    source.sync(resolve(workingTree), resolve(manifest));
  else
    throw new Error("Usage: sync-mnemocode-sskr.mjs --check | --working-tree PATH SOURCE-MANIFEST");
  console.log("Verified the imported MnemoCode SSKR closure; no wallet-tools rebuild claimed.");
}
