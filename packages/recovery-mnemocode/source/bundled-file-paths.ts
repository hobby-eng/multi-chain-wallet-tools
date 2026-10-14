// The files that the program reads at run time, by their paths from the package root: what the
// single executable embeds (scripts/build-executable.mjs) and what the readers ask for through
// bundled-files.ts. No imports, so that a build script loads it with Node.js's type stripping.

/** The public test vectors that the self-test checks the transformations against. */
export const PUBLIC_VECTORS_FILE = "vectors/mnemocode-v1.json";
/** The folder of the SSKR engine, which its manifest names its files from. */
export const SSKR_ENGINE_FOLDER = "sskr-wasm/";
/** The SHA-256 of each file of the engine, checked before it runs (sskr/runtime.ts). */
export const SSKR_MANIFEST = "integrity.json";
/** The engine's JavaScript bridge and its WebAssembly, by the names the manifest gives them. */
export const SSKR_BRIDGE = "generated/recovery_sskr_wasm.js";
/** The engine's WebAssembly, by the name the manifest gives it. */
export const SSKR_BINARY = "generated/recovery_sskr_wasm_bg.wasm";
/** The folder of the files that the card renderers read (export/platform.ts renderAssets). */
export const ASSETS_FOLDER = "assets/";
