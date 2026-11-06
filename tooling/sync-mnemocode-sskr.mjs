/** Verify an exact imported bridge; coordinated intake also updates its portable readers. */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isMainScript } from "./run-script.mjs";
import {
  IntakeDirectory,
  IntakeIdentity,
  MnemoCodeIntakeError,
} from "./mnemocode-intake-files.mjs";
import { MnemoCodeSskrLayout } from "./mnemocode-sskr-layout.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIRECTORY = MnemoCodeSskrLayout.directory;

function bridgeVersion(bytes) {
  // Match only [package], never a dependency's version.
  const section = bytes
    .toString("utf8")
    .split(/^\[package\]\s*$/mu)[1]
    ?.split(/^\[/mu)[0];
  const version = section?.match(/^version\s*=\s*"(\d+\.\d+\.\d+)"\s*$/mu)?.[1];
  if (version === undefined) throw new MnemoCodeIntakeError("version");
  return version;
}

/** Owns source/asset pins and package version; the host canonical container gate stays separate. */
export class MnemoCodeSskrSource {
  #root;
  constructor(root = ROOT) {
    this.#root = root;
  }

  /**
   * Refuses drift in the legacy ten-pin intake or the reviewed producer closure. `before`: the
   * state an intake starts from, which may predate files and pins that the layout added since (they
   * are then written new); what it has must be in the layout, pinned by its own integrity.json.
   */
  verify({ before = false } = {}) {
    const base = resolve(this.#root, DIRECTORY);
    const metadata = new IntakeDirectory(base, ["source.json", "package.json"]);
    const manifest = IntakeIdentity.json(metadata.read("source.json"));
    if (manifest.repository !== "hobby-eng/mnemocode") throw new MnemoCodeIntakeError("identity");
    IntakeIdentity.requireHash(manifest.sourceFingerprint);
    const current = manifest.schemaVersion === 2;
    if (!current && manifest.schemaVersion !== 1) throw new MnemoCodeIntakeError("identity");
    const layout = current
      ? MnemoCodeSskrLayout.files
      : MnemoCodeSskrLayout.legacyFiles.map((path) => ({ target: path }));
    // An intake before MnemoCode shipped its licence files kept the bridge's LICENSE as it was;
    // the state an intake starts from may still list it.
    const retained = before && Object.hasOwn(manifest.files, "LICENSE") ? ["LICENSE"] : [];
    const expected = current
      ? [
          ...layout
            .map(({ target }) => target)
            .filter((target) => !before || Object.hasOwn(manifest.files, target)),
          ...retained,
        ]
      : layout.map(({ target }) => target);
    IntakeIdentity.exactKeys(manifest.files, expected);
    const directory = new IntakeDirectory(base, [...expected, "package.json"]);
    const loaded = new Map(
      expected.map((file) => [
        file,
        IntakeIdentity.pinned(directory.read(file), manifest.files[file]),
      ]),
    );
    const pins = IntakeIdentity.json(loaded.get("integrity.json"));
    const pinLayout = current
      ? MnemoCodeSskrLayout.pins.filter(({ pin }) => !before || Object.hasOwn(pins, pin))
      : MnemoCodeSskrLayout.pins.filter(({ target }) => expected.includes(target));
    IntakeIdentity.exactKeys(
      pins,
      pinLayout.map(({ pin }) => pin),
    );
    for (const { pin, target } of pinLayout) IntakeIdentity.pinned(loaded.get(target), pins[pin]);
    const version = IntakeIdentity.json(directory.read("package.json")).version;
    if (version !== manifest.version || bridgeVersion(loaded.get("rust/Cargo.toml")) !== version)
      throw new MnemoCodeIntakeError("version");
    if (current) {
      IntakeIdentity.handover(manifest.handover);
      if (manifest.handover?.snapshotFingerprint !== manifest.sourceFingerprint)
        throw new MnemoCodeIntakeError("identity");
    }
    return manifest;
  }

  /** Builds validated writes; importing native bytes without their portable readers is unavailable. */
  prepare(handover) {
    const previous = this.verify({ before: true });
    const files = MnemoCodeSskrLayout.files.map(({ source, target }) => ({
      path: `${DIRECTORY}/${target}`,
      target,
      bytes: handover.read(source),
    }));
    const loaded = new Map(files.map(({ target, bytes }) => [target, bytes]));
    const pins = IntakeIdentity.json(loaded.get("integrity.json"));
    IntakeIdentity.exactKeys(
      pins,
      MnemoCodeSskrLayout.pins.map(({ pin }) => pin),
    );
    for (const { pin, target } of MnemoCodeSskrLayout.pins)
      IntakeIdentity.pinned(loaded.get(target), pins[pin]);
    const version = bridgeVersion(loaded.get("rust/Cargo.toml"));
    const pkgPath = `${DIRECTORY}/package.json`;
    const pkg = IntakeIdentity.json(new IntakeDirectory(this.#root, [pkgPath]).read(pkgPath));
    const manifest = {
      schemaVersion: 2,
      repository: "hobby-eng/mnemocode",
      version,
      sourceFingerprint: handover.identity.snapshotFingerprint,
      handover: handover.identity,
      unreleased: "a reviewed frozen local producer candidate, not a release",
      canonicalWalletToolsComparison:
        "Not run for this intake; the canonical host gate remains mandatory.",
      files: Object.fromEntries(
        files.map(({ target, bytes }) => [target, IntakeIdentity.hash(bytes)]),
      ),
    };
    const encode = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
    return {
      files: files.map(({ path, target, bytes }) => ({
        path,
        bytes,
        expectedBefore: previous.files[target] ?? null,
      })),
      metadata: [
        { path: pkgPath, bytes: encode({ ...pkg, version }) },
        { path: `${DIRECTORY}/source.json`, bytes: encode(manifest) },
      ],
      manifest,
    };
  }
}

if (isMainScript(import.meta.url)) {
  if (process.argv.length !== 3 || process.argv[2] !== "--check")
    throw new MnemoCodeIntakeError("identity");
  new MnemoCodeSskrSource().verify();
  console.log(
    "Verified the imported MnemoCode SSKR closure; use sync-mnemocode-intake.mjs for coherent intake.",
  );
}
