const FIRST_PARTY_MODULES = [
  Object.freeze({
    label: "Dash Orchard WASM",
    archiveDirectory: "dash",
    packageDirectory: "dash-shielded-wasm",
    stem: "dash_shielded_wasm",
    buildScript: "tooling/build-shielded-wasm.mjs",
  }),
  Object.freeze({
    label: "Codex32 WASM",
    archiveDirectory: "codex32",
    packageDirectory: "recovery-codex32-wasm",
    stem: "recovery_codex32_wasm",
    buildScript: "tooling/build-recovery-codex32-wasm.mjs",
  }),
  Object.freeze({
    label: "SSKR WASM",
    archiveDirectory: "sskr",
    packageDirectory: "recovery-sskr-wasm",
    // The shared SSKR bridge has its own compatibility version for external hosts.
    releaseManaged: false,
    stem: "recovery_sskr_wasm",
    buildScript: "tooling/build-recovery-sskr-wasm.mjs",
  }),
  Object.freeze({
    label: "Gordian Envelope WASM",
    archiveDirectory: "envelope",
    packageDirectory: "recovery-envelope-wasm",
    stem: "recovery_envelope_wasm",
    buildScript: "tooling/build-recovery-envelope-wasm.mjs",
  }),
];

/** Catalog roles distinguish locally built WASM from native crates and vendored MHFE. */
export class WasmModuleCatalog {
  #modules;
  #native;

  constructor(modules = FIRST_PARTY_MODULES) {
    this.#modules = Object.freeze(
      modules.map((module) =>
        Object.freeze({
          ...module,
          manifestPath: `packages/${module.packageDirectory}/rust/Cargo.toml`,
          lockPath: `packages/${module.packageDirectory}/rust/Cargo.lock`,
          generatedDirectory: `packages/${module.packageDirectory}/generated`,
          wasmPath: `packages/${module.packageDirectory}/generated/${module.stem}_bg.wasm`,
          offlineDeclarations: module.archiveDirectory !== "dash",
        }),
      ),
    );
    this.#native = Object.freeze([
      ...this.#modules.map(({ label, manifestPath, lockPath }) =>
        Object.freeze({ label, manifestPath, lockPath }),
      ),
      Object.freeze({
        label: "Executable Key Derivation Tool",
        manifestPath: "apps/key-derivation/launcher/Cargo.toml",
        lockPath: "apps/key-derivation/launcher/Cargo.lock",
      }),
    ]);
  }

  firstParty() {
    return this.#modules;
  }
  nativeCrates() {
    return this.#native;
  }
  rustsecMatrix() {
    return {
      include: this.#native.map(({ label, lockPath }) => ({ crate: label, lockfile: lockPath })),
    };
  }
}

export const WASM_CATALOG = new WasmModuleCatalog();
export const WASM_MODULES = WASM_CATALOG.firstParty();
