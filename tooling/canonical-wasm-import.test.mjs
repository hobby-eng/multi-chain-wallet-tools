import { afterEach, expect, it, vi } from "vitest";

const enumeration = vi.hoisted(() => ({ root: null, entries: 0, opened: 0, closed: 0 }));
vi.mock("node:fs", async (original) => {
  const actual = await original();
  const watched = (path) =>
    enumeration.root !== null &&
    (String(path) === enumeration.root || String(path).startsWith(enumeration.root + "/"));
  return {
    ...actual,
    readdirSync(path, options) {
      const entries = actual.readdirSync(path, options);
      if (watched(path)) enumeration.entries += entries.length;
      return entries;
    },
    opendirSync(path, options) {
      const directory = actual.opendirSync(path, options);
      if (!watched(path)) return directory;
      enumeration.opened += 1;
      return {
        readSync() {
          const entry = directory.readSync();
          if (entry !== null) enumeration.entries += 1;
          return entry;
        },
        closeSync() {
          enumeration.closed += 1;
          directory.closeSync();
        },
      };
    },
  };
});
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  unlinkSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { WASM_MODULES } from "./wasm-modules.mjs";
import {
  WASM_MANIFEST_SCHEMA,
  WASM_MANIFEST_GENERATOR,
  WasmIntegrityRecord,
} from "./verify-wasm-integrity.mjs";
import { CanonicalWasmImport } from "./canonical-wasm-import.mjs";

const temporary = [];
afterEach(() => {
  enumeration.root = null;
  enumeration.entries = enumeration.opened = enumeration.closed = 0;
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const text = (value) => Buffer.concat([Buffer.of(Buffer.byteLength(value)), Buffer.from(value)]);
// A literal public empty WebAssembly 1.0 module, with one specification-encoded producers section.
function moduleBytes(version = "0.2.129") {
  const producer = Buffer.concat([
    text("producers"),
    Buffer.of(1),
    text("processed-by"),
    Buffer.of(1),
    text("wasm-bindgen"),
    text(version),
  ]);
  return Buffer.concat([
    Buffer.from("0061736d01000000", "hex"),
    Buffer.of(0, producer.length),
    producer,
  ]);
}
function write(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}

function fixture() {
  // Synthetic format fixture only: no checkout, source tree, Cargo cache or dependency is copied.
  const base = mkdtempSync(join(tmpdir(), "canonical-wasm-import-"));
  temporary.push(base);
  const root = join(base, "host");
  const exported = join(base, "export");
  const source = {
    schemaVersion: WASM_MANIFEST_SCHEMA,
    generator: WASM_MANIFEST_GENERATOR,
    modules: {},
  };
  const candidate = structuredClone(source);
  const before = new Map();
  for (const module of WASM_MODULES) {
    const sourceSha256 = hash("synthetic-public-build-input-" + module.packageDirectory);
    source.modules[module.packageDirectory] = { sourceSha256, generated: {} };
    candidate.modules[module.packageDirectory] = { sourceSha256, generated: {} };
    for (const name of module.generatedFiles) {
      const retained = Buffer.from("synthetic retained " + name);
      const bytes = name.endsWith(".wasm")
        ? moduleBytes()
        : Buffer.from(
            name.endsWith(".js")
              ? "export const value = 1;\n"
              : "export declare const value: number;\n",
          );
      const path = `${module.generatedDirectory}/${name}`;
      write(join(root, path), retained);
      before.set(path, retained);
      write(join(exported, module.archiveDirectory, name), bytes);
      source.modules[module.packageDirectory].generated[name] = hash(retained);
      candidate.modules[module.packageDirectory].generated[name] = hash(bytes);
    }
  }
  const old = Buffer.from(JSON.stringify(source) + "\n");
  write(join(root, "tooling/wasm-canonical-manifest.json"), old);
  before.set("tooling/wasm-canonical-manifest.json", old);
  const save = () =>
    write(
      join(exported, "wasm-canonical-manifest.json"),
      JSON.stringify(candidate, null, 2) + "\n",
    );
  save();
  const importer = new CanonicalWasmImport(root, source);
  const replace = (module, name, bytes) => {
    write(join(exported, module.archiveDirectory, name), bytes);
    candidate.modules[module.packageDirectory].generated[name] = hash(bytes);
    save();
  };
  const unchanged = () => {
    for (const [path, bytes] of before)
      expect(readFileSync(join(root, path)).equals(bytes), path).toBe(true);
  };
  return { root, exported, source, candidate, save, importer, replace, unchanged, base };
}

it("installs every checked payload and the manifest while preserving destination directories", () => {
  const f = fixture();
  expect(f.importer.install(f.exported, f.source)).toBe(17);
  for (const module of WASM_MODULES)
    for (const name of module.generatedFiles)
      expect(
        readFileSync(join(f.root, module.generatedDirectory, name)).equals(
          readFileSync(join(f.exported, module.archiveDirectory, name)),
        ),
      ).toBe(true);
  expect(
    readFileSync(join(f.root, "tooling/wasm-canonical-manifest.json")).equals(
      readFileSync(join(f.exported, "wasm-canonical-manifest.json")),
    ),
  ).toBe(true);
});

it.each([
  "invalid-json",
  "extra-file",
  "missing-file",
  "extra-role",
  "schema",
  "generator",
  "hash",
  "wasm",
  "producer",
  "loader",
  "utf8",
  "builder-path",
])("refuses %s without replacing any retained file", (kind) => {
  const f = fixture();
  const module = WASM_MODULES.at(-1);
  const wasm = `${module.stem}_bg.wasm`;
  const glue = `${module.stem}.js`;
  if (kind === "invalid-json") write(join(f.exported, "wasm-canonical-manifest.json"), "not JSON");
  if (kind === "extra-file") write(join(f.exported, "unexpected.txt"), "public");
  if (kind === "missing-file") unlinkSync(join(f.exported, module.archiveDirectory, glue));
  if (kind === "extra-role") {
    f.candidate.modules[module.packageDirectory].generated["unknown.js"] = hash("public");
    f.save();
  }
  if (kind === "schema") {
    f.candidate.schemaVersion = 2;
    f.save();
  }
  if (kind === "generator") {
    f.candidate.generator = "synthetic-other-generator";
    f.save();
  }
  if (kind === "hash")
    write(join(f.exported, module.archiveDirectory, glue), "changed without a matching hash");
  if (kind === "wasm") f.replace(module, wasm, Buffer.from("invalid WASM"));
  if (kind === "producer") f.replace(module, wasm, moduleBytes("0.2.0"));
  if (kind === "loader")
    f.replace(module, glue, Buffer.from("export default function __wbg_init() {}"));
  if (kind === "utf8") f.replace(module, glue, Buffer.of(0xff));
  if (kind === "builder-path")
    f.replace(module, glue, Buffer.from("// /home/builder/synthetic-source\n"));
  expect(() => f.importer.install(f.exported, f.source)).toThrow(
    expect.objectContaining({ code: expect.stringMatching(/^wasm\.import\./u) }),
  );
  f.unchanged();
});

it.each(["export", "host"])("refuses changed %s source identity before any write", (side) => {
  const f = fixture();
  const current = structuredClone(f.source);
  const key = WASM_MODULES[0].packageDirectory;
  (side === "host" ? current : f.candidate).modules[key].sourceSha256 =
    hash("changed-public-source");
  if (side === "export") f.save();
  expect(() => f.importer.install(f.exported, current)).toThrow(
    expect.objectContaining({ code: "wasm.import.source" }),
  );
  f.unchanged();
});

it("does not overwrite a destination edited while Docker was building", () => {
  const f = fixture();
  const last = WASM_MODULES.at(-1);
  const name = last.generatedFiles.at(-1);
  const changed = join(f.root, last.generatedDirectory, name);
  write(changed, "public concurrent edit");
  expect(() => f.importer.install(f.exported, f.source)).toThrow(
    expect.objectContaining({ code: "wasm.import.changed" }),
  );
  expect(readFileSync(changed, "utf8")).toBe("public concurrent edit");
  const first = WASM_MODULES[0];
  expect(
    readFileSync(join(f.root, first.generatedDirectory, first.generatedFiles[0]), "utf8"),
  ).toBe("synthetic retained " + first.generatedFiles[0]);
});

it("refuses a symlinked export without changing either the host or the linked public file", () => {
  const f = fixture();
  const module = WASM_MODULES[0];
  const name = module.generatedFiles[0];
  const outside = join(f.base, "outside-public-file");
  write(outside, "public fixture");
  const file = join(f.exported, module.archiveDirectory, name);
  unlinkSync(file);
  symlinkSync(outside, file);
  expect(() => f.importer.install(f.exported, f.source)).toThrow(
    expect.objectContaining({ code: "wasm.import.files" }),
  );
  f.unchanged();
  expect(readFileSync(outside, "utf8")).toBe("public fixture");
});

function reversedFields(value) {
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, item]) => [key, reversedFields(item)]),
  );
}

it("normalizes reordered manifest fields into the same canonical integrity record", () => {
  const f = fixture();
  write(
    join(f.exported, "wasm-canonical-manifest.json"),
    JSON.stringify(reversedFields(f.candidate)),
  );
  expect(f.importer.install(f.exported, f.source)).toBe(17);
  expect(readFileSync(join(f.root, "tooling/wasm-canonical-manifest.json"), "utf8")).toBe(
    JSON.stringify(f.candidate, null, 2) + "\n",
  );
});

it("owns the canonical integrity record independently of its input and returned snapshots", () => {
  const f = fixture();
  const expected = JSON.stringify(f.candidate, null, 2) + "\n";
  const record = new WasmIntegrityRecord(reversedFields(f.candidate));
  f.candidate.generator = "changed public fixture";
  record.value().modules = {};
  record.bytes().fill(0);
  expect(record.bytes().toString("utf8")).toBe(expected);
});

it.each(["root", "module"])(
  "bounds %s directory enumeration before refusing excess files",
  (level) => {
    const f = fixture();
    const module = WASM_MODULES[0];
    const directory = level === "root" ? f.exported : join(f.exported, module.archiveDirectory);
    // Empty files bypass byte limits. Observe actual native directory reads, without replacing I/O.
    for (let index = 0; index < 1000; index += 1) write(join(directory, `extra-${index}`), "");
    enumeration.root = f.exported;
    expect(() => f.importer.install(f.exported, f.source)).toThrow(
      expect.objectContaining({ code: "wasm.import.shape" }),
    );
    const rootBudget = WASM_MODULES.length + 2; // Fixed members and at most one excess entry.
    const childBudget = level === "root" ? 0 : module.generatedFiles.length + 1;
    expect(enumeration.entries).toBeLessThanOrEqual(rootBudget + childBudget);
    expect(enumeration.opened).toBe(enumeration.closed);
    f.unchanged();
  },
);
