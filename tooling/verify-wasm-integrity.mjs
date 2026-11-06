import { isMainScript } from "./run-script.mjs";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WASM_MODULES } from "./wasm-modules.mjs";
import { IntakeDirectory, IntakeIdentity } from "./mnemocode-intake-files.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
/** Export filename and host path of the first-party integrity record. */
export const WASM_MANIFEST_FILE = "wasm-canonical-manifest.json";
export const WASM_MANIFEST_PATH = `tooling/${WASM_MANIFEST_FILE}`;
const manifestPath = resolve(root, WASM_MANIFEST_PATH);

/** Version of the closed first-party generated-WASM integrity record. */
export const WASM_MANIFEST_SCHEMA = 1;
/** Canonical generator identity shared by the container writer and host importer. */
export const WASM_MANIFEST_GENERATOR = "Dockerfile.reproducible wasm-artifacts";

const REFUSALS = {
  shape: "The canonical WASM integrity record has an unexpected schema, file set or digest.",
  missing: "Canonical WASM integrity manifest is missing. Run pnpm build:reproducible:wasm.",
  changed:
    "Generated WASM or its build inputs differ from the canonical container record. Run pnpm build:reproducible:wasm; local WASM builds are development-only.",
  writer:
    "Refusing to write the WASM record outside the canonical Docker build. Run pnpm build:reproducible:wasm.",
};

/** Stable, input-free integrity refusals; malformed records retain a diagnostic cause. */
export class WasmIntegrityError extends Error {
  constructor(reason, options) {
    super(REFUSALS[reason], options);
    this.name = "WasmIntegrityError";
    this.code = `wasm.integrity.${reason}`;
  }
}

/** Owns the closed record and its one serialization, independent of JSON member order. */
export class WasmIntegrityRecord {
  #value;

  /** Refuses unknown fields, missing roles and non-SHA256 digests before taking a snapshot. */
  constructor(value) {
    try {
      IntakeIdentity.exactKeys(value, ["schemaVersion", "generator", "modules"]);
      if (
        value.schemaVersion !== WASM_MANIFEST_SCHEMA ||
        value.generator !== WASM_MANIFEST_GENERATOR
      )
        throw new WasmIntegrityError("shape");
      IntakeIdentity.exactKeys(
        value.modules,
        WASM_MODULES.map((module) => module.packageDirectory),
      );
      const modules = WASM_MODULES.map((module) => {
        const record = value.modules[module.packageDirectory];
        IntakeIdentity.exactKeys(record, ["sourceSha256", "generated"]);
        IntakeIdentity.requireHash(record.sourceSha256);
        IntakeIdentity.exactKeys(record.generated, module.generatedFiles);
        const generated = Object.fromEntries(
          module.generatedFiles.map((name) => [
            name,
            IntakeIdentity.requireHash(record.generated[name]),
          ]),
        );
        return [module.packageDirectory, { sourceSha256: record.sourceSha256, generated }];
      });
      this.#value = {
        schemaVersion: WASM_MANIFEST_SCHEMA,
        generator: WASM_MANIFEST_GENERATOR,
        modules: Object.fromEntries(modules),
      };
    } catch (cause) {
      if (cause instanceof WasmIntegrityError) throw cause;
      throw new WasmIntegrityError("shape", { cause });
    }
  }

  /** Returns an independent snapshot; editing it cannot alter the owned record. */
  value() {
    return structuredClone(this.#value);
  }

  /** UTF-8 JSON with catalog-ordered fields, two-space indentation and a final newline. */
  bytes() {
    return Buffer.from(JSON.stringify(this.#value, null, 2) + "\n");
  }
}

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? filesBelow(path) : [path];
    })
    .sort();
}

function hashFiles(paths) {
  const hash = createHash("sha256");
  for (const path of paths) {
    const name = relative(root, path).replaceAll("\\", "/");
    const bytes = readFileSync(path);
    hash.update(`${name}\0${bytes.length}\0`);
    hash.update(bytes);
    hash.update("\0");
  }
  return hash.digest("hex");
}

function moduleRecord(module) {
  const packageRoot = resolve(root, "packages", module.packageDirectory);
  const rustRoot = resolve(packageRoot, "rust");
  const sourcePaths = [
    resolve(root, ".dockerignore"),
    resolve(root, "Dockerfile.reproducible"),
    resolve(root, module.buildScript),
    // The steps every module's build script shares, and the list it reads its module from.
    resolve(root, "tooling/wasm-build.mjs"),
    resolve(root, "tooling/wasm-modules.mjs"),
    resolve(root, "tooling/verify-wasm-integrity.mjs"),
    resolve(root, "tooling/mnemocode-intake-files.mjs"),
    resolve(root, "tooling/toolchain-pins.mjs"),
    resolve(root, "tooling/toolchain-pins.json"),
    resolve(root, "tooling/verify-wasm-producers.mjs"),
    resolve(root, "tooling/offline-wasm-declarations.mjs"),
    resolve(root, "tooling/rust-toolchain.mjs"),
    ...filesBelow(rustRoot).filter((path) => !path.includes("/target/")),
  ];
  const generatedRoot = resolve(packageRoot, "generated");
  if (!existsSync(generatedRoot))
    throw new Error(`${module.label} generated directory is missing.`);
  const generated = Object.fromEntries(
    filesBelow(generatedRoot).map((path) => [
      relative(generatedRoot, path).replaceAll("\\", "/"),
      createHash("sha256").update(readFileSync(path)).digest("hex"),
    ]),
  );
  return { sourceSha256: hashFiles(sourcePaths), generated };
}

export function createWasmIntegrityManifest() {
  return new WasmIntegrityRecord({
    schemaVersion: WASM_MANIFEST_SCHEMA,
    generator: WASM_MANIFEST_GENERATOR,
    modules: Object.fromEntries(
      WASM_MODULES.map((module) => [module.packageDirectory, moduleRecord(module)]),
    ),
  }).value();
}

export function verifyWasmIntegrityManifest() {
  if (!existsSync(manifestPath)) {
    throw new WasmIntegrityError("missing");
  }
  const directory = new IntakeDirectory(root, [WASM_MANIFEST_PATH]);
  const expected = new WasmIntegrityRecord(IntakeIdentity.json(directory.read(WASM_MANIFEST_PATH)));
  const actual = new WasmIntegrityRecord(createWasmIntegrityManifest());
  if (!actual.bytes().equals(expected.bytes())) throw new WasmIntegrityError("changed");
}

/** The WORKDIR of Dockerfile.reproducible; verify-reproducible-container.mjs keeps both equal. */
export const CANONICAL_WORKSPACE = "/workspace";

/**
 * This execution guard is not an attestation; release Docker comparison establishes provenance.
 * BuildKit creates no /.dockerenv, so the container is recognized by its checkout location.
 */
export function assertCanonicalManifestWriter(environment = process.env, workspace = root) {
  if (environment.WALLET_TOOLS_CANONICAL_WASM !== "1" || workspace !== CANONICAL_WORKSPACE)
    throw new WasmIntegrityError("writer");
}

if (isMainScript(import.meta.url)) {
  if (process.argv.includes("--write")) {
    assertCanonicalManifestWriter();
    writeFileSync(manifestPath, new WasmIntegrityRecord(createWasmIntegrityManifest()).bytes());
    console.log(`Recorded canonical generated-WASM integrity in ${relative(root, manifestPath)}.`);
  } else {
    verifyWasmIntegrityManifest();
    console.log(
      `Verified recorded generated-WASM bytes and source inputs for ${WASM_MODULES.length} modules; canonical provenance requires the Docker comparison.`,
    );
  }
}
