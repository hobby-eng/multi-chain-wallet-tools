// The MHFE browser package vendored into packages/recovery-mhfe-wasm/generated: its manifest,
// modules.json, which lists every file of the runtime and of each module with its SHA-256, and the
// files vendored from it, in their nested folders. The one owner of that inventory: the provenance
// check binds the files to the manifest and the manifest to its pin, and the verification record
// lists the same files, so that neither reads the folder its own way (AUD-024-BLD001).
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** The package's folder, from the repository root. */
const DIRECTORY = "packages/recovery-mhfe-wasm/generated";
const MANIFEST = "modules.json";
export const MHFE_MANIFEST_SHA256 =
  "897d0e5b11efbb1e3a817acb2a51da6e85d0a5187b4b62c9c3d899aefaa6f69e";
/** Source identity accompanies the package without adding undeclared runtime files. */
export const MHFE_SOURCE_MANIFEST = "packages/recovery-mhfe-wasm/source.json";
const SHA256 = /^[0-9a-f]{64}$/u;
/** Files of the MHFE package that are not vendored: the executable Deriver replaces the launcher. */
const NOT_VENDORED = new Set(["core/mhfe-fast-mode.py"]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function record(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error(`Invalid MHFE manifest ${label}: expected an object.`);
  return value;
}

function safePath(value, label, singleSegment = false) {
  const parts = value.split("/");
  if (
    (singleSegment && parts.length !== 1) ||
    parts.some((part) => part === "." || part === ".." || !/^[A-Za-z0-9_.-]+$/u.test(part))
  )
    throw new Error(`Invalid MHFE manifest ${label}: expected a safe relative path.`);
  return value;
}

export class VendoredMhfePackage {
  static DIRECTORY = DIRECTORY;
  #root;
  #pin;
  #directory;
  #verifyHostOmissions;
  #documentation;

  constructor(root, pinnedManifestSha256 = MHFE_MANIFEST_SHA256, options = {}) {
    this.#root = root;
    this.#pin = pinnedManifestSha256;
    this.#directory = safePath(options.directory ?? DIRECTORY, "package directory");
    this.#verifyHostOmissions = options.verifyHostOmissions === true;
    this.#documentation = Object.entries(record(options.documentation ?? {}, "documentation")).map(
      ([path, hash]) => {
        safePath(path, "documentation file");
        if (typeof hash !== "string" || !SHA256.test(hash))
          throw new Error("Invalid MHFE documentation hash.");
        return Object.freeze({ path, sha256: hash });
      },
    );
  }

  get manifestPath() {
    return `${this.#directory}/${MANIFEST}`;
  }

  // Reject links at every component: a safe relative spelling alone does not confine reads.
  #read(path) {
    const parts = `${this.#directory}/${path}`.split("/");
    let file = this.#root;
    for (const [index, part] of parts.entries()) {
      file = resolve(file, part);
      const stat = lstatSync(file);
      if (
        stat.isSymbolicLink() ||
        (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())
      )
        throw new Error(
          `MHFE package path ${path} must contain only regular files and directories.`,
        );
    }
    return readFileSync(file);
  }

  #entries(pin, includeHostOmissions = false) {
    if (typeof pin !== "string" || !SHA256.test(pin))
      throw new Error("Invalid MHFE manifest pin: expected a lowercase SHA-256.");
    const bytes = this.#read(MANIFEST);
    const actual = sha256(bytes);
    if (actual !== pin)
      throw new Error(
        `Pinned source checksum mismatch for ${this.manifestPath}: expected ${pin}, got ${actual}.`,
      );
    const manifest = record(JSON.parse(bytes.toString("utf8")), "root");
    const modules = record(manifest.modules, "modules");
    if (Object.hasOwn(modules, "runtime"))
      throw new Error("Invalid MHFE manifest: modules cannot replace runtime.");
    const folders = [["runtime", manifest.runtime], ...Object.entries(modules)];
    const entries = [];
    for (const [folder, value] of folders) {
      safePath(folder, "folder", true);
      const module = record(value, folder);
      const files = record(module.files, `${folder}.files`);
      if (Object.keys(files).length === 0)
        throw new Error(`Invalid MHFE manifest ${folder}.files: expected at least one file.`);
      if (
        module.requires !== undefined &&
        (!Array.isArray(module.requires) ||
          module.requires.some(
            (name) =>
              typeof name !== "string" || (name !== "runtime" && !Object.hasOwn(modules, name)),
          ))
      )
        throw new Error(`Invalid MHFE manifest ${folder}.requires.`);
      for (const [name, hash] of Object.entries(files)) {
        safePath(name, "file");
        if (typeof hash !== "string" || !SHA256.test(hash))
          throw new Error(`Invalid MHFE manifest hash for ${folder}/${name}.`);
        const path = `${folder}/${name}`;
        if (includeHostOmissions || !NOT_VENDORED.has(path))
          entries.push(Object.freeze({ path, sha256: hash }));
      }
    }
    return entries;
  }

  /** Only a pinned, admitted manifest can enumerate package files. */
  entries() {
    // Consumers that hash these paths must never follow an unverified link or changed file.
    this.verify();
    return this.#entries(this.#pin);
  }

  files() {
    return [
      this.manifestPath,
      ...this.entries().map(({ path }) => `${this.#directory}/${path}`),
    ].sort();
  }

  /** Version and build identity come only from the verified package manifest. */
  identity() {
    this.verify();
    const manifest = JSON.parse(this.#read(MANIFEST).toString("utf8"));
    if (!/^\d+\.\d+\.\d+$/u.test(manifest.version) || !/^[0-9a-f]{16}$/u.test(manifest.buildId))
      throw new Error("Invalid MHFE package version or build identity.");
    return Object.freeze({ version: manifest.version, buildId: manifest.buildId });
  }

  /** Admits the host's source record against the same verified package, never a second file list. */
  sourceIdentity() {
    const identity = this.identity();
    const source = record(
      JSON.parse(readFileSync(resolve(this.#root, MHFE_SOURCE_MANIFEST), "utf8")),
      "source identity",
    );
    const expected = Object.fromEntries([
      [MANIFEST, this.#pin],
      ...this.#entries(this.#pin).map(({ path, sha256 }) => [path, sha256]),
    ]);
    const declared = record(source.files, "source files");
    if (
      source.repository !== "hobby-eng/mhfe" ||
      !/^[0-9a-f]{40}$/u.test(source.commit ?? "") ||
      !SHA256.test(source.sourceFingerprint ?? "") ||
      source.version !== identity.version ||
      source.buildId !== identity.buildId ||
      source.manifestSha256 !== this.#pin ||
      JSON.stringify(Object.entries(declared).sort()) !==
        JSON.stringify(Object.entries(expected).sort())
    )
      throw new Error("MHFE source identity does not match the verified package.");
    return Object.freeze(source);
  }

  verify(pinnedManifestSha256 = this.#pin) {
    const listed = new Set([MANIFEST]);
    const runtime = this.#entries(pinnedManifestSha256, this.#verifyHostOmissions);
    for (const { path, sha256: expected } of [...runtime, ...this.#documentation]) {
      if (listed.has(path)) throw new Error("MHFE documentation overlaps its runtime manifest.");
      listed.add(path);
      const actual = sha256(this.#read(path));
      if (actual !== expected)
        throw new Error(
          `MHFE package file ${path} does not match modules.json: expected ${expected}, got ${actual}.`,
        );
    }
    const folder = resolve(this.#root, this.#directory);
    const present = readdirSync(folder, { recursive: true, withFileTypes: true });
    if (present.some((entry) => !entry.isDirectory() && !entry.isFile()))
      throw new Error("The MHFE package contains a link or non-regular file.");
    const extra = present
      .filter((entry) => entry.isFile())
      .map((entry) =>
        resolve(entry.parentPath, entry.name)
          .slice(folder.length + 1)
          .replaceAll("\\", "/"),
      )
      .filter((path) => !listed.has(path));
    if (extra.length > 0)
      throw new Error(
        `The MHFE package holds files its manifest does not list: ${extra.join(", ")}.`,
      );
  }
}
