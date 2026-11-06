import { lstatSync, opendirSync } from "node:fs";
import { resolve } from "node:path";
import { WASM_MODULES } from "./wasm-modules.mjs";
import { IntakeDirectory, IntakeIdentity, IntakeWritePlan } from "./mnemocode-intake-files.mjs";
import { assertNoBuilderPaths } from "./builder-paths.mjs";
import {
  WASM_MANIFEST_FILE as MANIFEST_NAME,
  WASM_MANIFEST_PATH as MANIFEST_PATH,
  WasmIntegrityRecord,
} from "./verify-wasm-integrity.mjs";
import {
  assertCanonicalWasmBindgenProducer,
  assertOfflineWasmDeclarations,
} from "./verify-wasm-producers.mjs";

const REFUSALS = {
  shape: "The canonical WASM export has an unexpected manifest or file set.",
  source: "WASM build inputs changed or the export describes another source snapshot.",
  changed: "A generated WASM destination changed while the container was building.",
  files: "The canonical WASM export failed file, hash or producer validation.",
};

/** Stable refusals of an export or a changed destination, before installation is permitted. */
export class CanonicalWasmImportError extends Error {
  constructor(reason, options) {
    super(REFUSALS[reason], options);
    this.name = "CanonicalWasmImportError";
    this.code = `wasm.import.${reason}`;
  }
}

function directoryMembers(path, expected) {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new CanonicalWasmImportError("files");
  // Empty files bypass byte budgets. Bound the native read buffer and stop at the first excess.
  const directory = opendirSync(path, { bufferSize: expected.length + 1 });
  const remaining = new Set(expected);
  try {
    for (let count = 0; count <= expected.length; count += 1) {
      const entry = directory.readSync();
      if (entry === null) {
        if (remaining.size !== 0) throw new CanonicalWasmImportError("shape");
        return;
      }
      if (!remaining.delete(entry.name)) throw new CanonicalWasmImportError("shape");
    }
    throw new CanonicalWasmImportError("shape");
  } finally {
    directory.closeSync();
  }
}

/**
 * Owns a pre-build source/destination snapshot and validates the complete fixed WASM export.
 * Uses the existing bounded regular-file reader and write plan; no project directory is removed.
 * File-system failure during writes can leave a partial update; metadata is last and gates refuse it.
 */
export class CanonicalWasmImport {
  #root;
  #expected;
  #before;

  /** sourceSnapshot is the trusted host integrity calculation made before starting Docker. */
  constructor(root, sourceSnapshot) {
    this.#root = root;
    try {
      this.#expected = new WasmIntegrityRecord(sourceSnapshot).value();
      const directory = new IntakeDirectory(root, this.#destinations());
      this.#before = new Map(this.#destinations().map((path) => [path, directory.capture(path)]));
    } catch (cause) {
      this.#refuse(cause);
    }
  }

  #refuse(cause) {
    if (cause instanceof CanonicalWasmImportError) throw cause;
    throw new CanonicalWasmImportError("files", { cause });
  }

  #destinations() {
    return [
      ...WASM_MODULES.flatMap((module) =>
        module.generatedFiles.map((name) => `${module.generatedDirectory}/${name}`),
      ),
      MANIFEST_PATH,
    ];
  }

  #readExport(exported, currentSource) {
    const current = new WasmIntegrityRecord(currentSource).value();
    const sourcePaths = [
      ...WASM_MODULES.flatMap((module) =>
        module.generatedFiles.map((name) => `${module.archiveDirectory}/${name}`),
      ),
      MANIFEST_NAME,
    ];
    const directory = new IntakeDirectory(exported, sourcePaths);
    directoryMembers(exported, [
      ...WASM_MODULES.map((module) => module.archiveDirectory),
      MANIFEST_NAME,
    ]);
    const record = new WasmIntegrityRecord(IntakeIdentity.json(directory.read(MANIFEST_NAME)));
    const candidate = record.value();
    const entries = [];
    for (const module of WASM_MODULES) {
      const expected = this.#expected.modules[module.packageDirectory];
      const actual = candidate.modules[module.packageDirectory];
      if (
        actual.sourceSha256 !== expected.sourceSha256 ||
        current.modules[module.packageDirectory].sourceSha256 !== expected.sourceSha256
      )
        throw new CanonicalWasmImportError("source");
      directoryMembers(resolve(exported, module.archiveDirectory), module.generatedFiles);
      const payloads = new Map(
        module.generatedFiles.map((name) => [
          name,
          IntakeIdentity.pinned(
            directory.read(`${module.archiveDirectory}/${name}`),
            actual.generated[name],
          ),
        ]),
      );
      for (const [name, bytes] of payloads) {
        assertNoBuilderPaths(bytes, module.label);
        if (!name.endsWith(".wasm")) new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      }
      const wasm = payloads.get(`${module.stem}_bg.wasm`);
      assertCanonicalWasmBindgenProducer(wasm, module.label);
      if (module.offlineDeclarations)
        assertOfflineWasmDeclarations(
          new TextDecoder("utf-8", { fatal: true }).decode(payloads.get(`${module.stem}.js`)),
          new TextDecoder("utf-8", { fatal: true }).decode(payloads.get(`${module.stem}.d.ts`)),
          module.label,
        );
      for (const [name, bytes] of payloads)
        entries.push({ path: `${module.generatedDirectory}/${name}`, bytes });
    }
    // Keep the previous manifest until every new generated file has been written.
    entries.push({ path: MANIFEST_PATH, bytes: record.bytes() });
    return entries.map((entry) => ({ ...entry, expectedBefore: this.#before.get(entry.path) }));
  }

  /**
   * currentSource is a fresh host calculation after Docker exits. Every source, payload and
   * destination is checked before any write. This validation does not attest container origin.
   */
  install(exported, currentSource) {
    try {
      const entries = this.#readExport(exported, currentSource);
      const destination = new IntakeDirectory(this.#root, this.#destinations());
      for (const [path, before] of this.#before)
        if (destination.capture(path) !== before) throw new CanonicalWasmImportError("changed");
      new IntakeWritePlan(this.#root, entries).apply();
      return entries.length;
    } catch (cause) {
      this.#refuse(cause);
    }
  }
}
