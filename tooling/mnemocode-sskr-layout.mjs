/** The producer's exact 32 integrity keys and their safe, in-package host destinations. */
const CORE = [
  "rust/Cargo.lock",
  "rust/Cargo.toml",
  "rust/clippy.toml",
  "rust/rust-toolchain.toml",
  "rust/src/lib.rs",
  "rust/src/refusal.rs",
  "rust/src/share_text.rs",
  ...[".js", ".d.ts", "_bg.wasm", "_bg.wasm.d.ts"].map(
    (suffix) => `generated/recovery_sskr_wasm${suffix}`,
  ),
];
const VENDOR = {
  "sskr-0.12.0": ["encoding", "error", "lib", "secret", "share", "spec"],
  "bc-shamir-0.13.0": ["error", "hazmat", "interpolate", "lib", "recovery_secret", "shamir"],
};
const NORMAL = [
  ...CORE,
  ...Object.entries(VENDOR).flatMap(([crate, modules]) => [
    ...["Cargo.toml", "LICENSE.md", "UPSTREAM.json", "clippy.toml"].map(
      (file) => `rust/vendor/${crate}/${file}`,
    ),
    ...modules.map((name) => `rust/vendor/${crate}/src/${name}.rs`),
  ]),
];
const PINS = Object.freeze([
  ...NORMAL.map((path) => Object.freeze({ pin: path, source: `sskr-wasm/${path}`, target: path })),
  // These two literal producer keys are identifiers, never filesystem paths to resolve.
  Object.freeze({
    pin: "../Dockerfile.sskr",
    source: "Dockerfile.sskr",
    target: "producer-recipe/Dockerfile.sskr",
  }),
  Object.freeze({
    pin: "../scripts/build-sskr-wasm.mjs",
    source: "scripts/build-sskr-wasm.mjs",
    target: "producer-recipe/build-sskr-wasm.mjs",
  }),
]);
const FILES = Object.freeze([
  ...PINS,
  ...[
    "integrity.json",
    "NOTICE.md",
    "UPSTREAM_NOTICES.md",
    "LINKED_LICENSES.txt",
    "LICENSE-MIT",
    "LICENSE-APACHE",
  ].map((path) => Object.freeze({ source: `sskr-wasm/${path}`, target: path })),
]);

/** One mapping for importer, offline closure checks and build-input provenance. */
export class MnemoCodeSskrLayout {
  static get directory() {
    return "packages/recovery-sskr-wasm";
  }
  static get pins() {
    return PINS;
  }
  /** Original producer recipes retained as provenance, not executable host modules. */
  static get provenanceTargets() {
    return PINS.filter(({ pin }) => pin.startsWith("../")).map(({ target }) => target);
  }
  static get files() {
    return FILES;
  }
  static get legacyFiles() {
    return [...CORE, "LICENSE", "NOTICE.md", "UPSTREAM_NOTICES.md", "integrity.json"];
  }
}
