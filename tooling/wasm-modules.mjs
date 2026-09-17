export const WASM_MODULES = Object.freeze([
  Object.freeze({
    label: 'Dash Orchard WASM',
    archiveDirectory: 'dash',
    packageDirectory: 'dash-shielded-wasm',
    stem: 'dash_shielded_wasm',
    buildScript: 'tooling/build-shielded-wasm.mjs',
  }),
  Object.freeze({
    label: 'Shamir WASM',
    archiveDirectory: 'shamir',
    packageDirectory: 'recovery-shamir-wasm',
    stem: 'recovery_shamir_wasm',
    buildScript: 'tooling/build-recovery-shamir-wasm.mjs',
  }),
  Object.freeze({
    label: 'Codex32 WASM',
    archiveDirectory: 'codex32',
    packageDirectory: 'recovery-codex32-wasm',
    stem: 'recovery_codex32_wasm',
    buildScript: 'tooling/build-recovery-codex32-wasm.mjs',
  }),
  Object.freeze({
    label: 'SSKR WASM',
    archiveDirectory: 'sskr',
    packageDirectory: 'recovery-sskr-wasm',
    stem: 'recovery_sskr_wasm',
    buildScript: 'tooling/build-recovery-sskr-wasm.mjs',
  }),
  Object.freeze({
    label: 'Gordian Envelope WASM',
    archiveDirectory: 'envelope',
    packageDirectory: 'recovery-envelope-wasm',
    stem: 'recovery_envelope_wasm',
    buildScript: 'tooling/build-recovery-envelope-wasm.mjs',
  }),
]);
