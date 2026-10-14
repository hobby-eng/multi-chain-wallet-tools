// The steps every WebAssembly module of the tools is built with: cargo for wasm32, wasm-bindgen at
// its pinned version into a staging folder, and the glue reduced to its synchronous offline API, so
// that no page can fetch or instantiate a module from the network. A module's own build script
// keeps only what is its own.
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeOfflineWasmDeclarations } from "./offline-wasm-declarations.mjs";
import {
  assertExactToolVersion,
  assertRustToolVersion,
  resolveRustToolchain,
} from "./rust-toolchain.mjs";
import { assertCanonicalWasmBindgenProducer } from "./verify-wasm-producers.mjs";
import { WASM_MODULES } from "./wasm-modules.mjs";
import { TOOLCHAIN_PINS } from "./toolchain-pins.mjs";

export const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
/** The wasm-bindgen whose output the canonical manifest pins. */
const WASM_BINDGEN = `wasm-bindgen ${TOOLCHAIN_PINS.wasmBindgen}`;

/** Throw on failure so callers can release staging resources before the CLI exits. */
export function runTool(command, args, environment, run = spawnSync) {
  const result = run(command, args, { cwd: root, env: environment, stdio: "inherit" });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0)
    throw Object.assign(new Error(`${command} failed (exit ${result.status ?? "signal"}).`), {
      exitCode: result.status ?? 1,
    });
}

/** The pinned toolchain, with wasm-bindgen checked; `environmentChanges` adapts its environment. */
export function wasmToolchain(environmentChanges = (environment) => environment) {
  const toolchain = resolveRustToolchain(root);
  const environment = environmentChanges(toolchain.environment);
  assertRustToolVersion(toolchain.cargo, { cwd: root, env: environment });
  assertExactToolVersion(toolchain.wasmBindgen, WASM_BINDGEN, { cwd: root, env: environment });
  return { ...toolchain, environment };
}

/** Compiles `module`'s crate for wasm32 with its locked dependencies. */
export function compileWasmCrate(module, { cargo, environment }) {
  const manifest = resolve(root, "packages", module.packageDirectory, "rust/Cargo.toml");
  runTool(
    cargo,
    [
      "build",
      "--manifest-path",
      manifest,
      "--target",
      "wasm32-unknown-unknown",
      "--release",
      "--locked",
    ],
    environment,
  );
  return resolve(
    root,
    "packages",
    module.packageDirectory,
    `rust/target/wasm32-unknown-unknown/release/${module.stem}.wasm`,
  );
}

/** `source` without the part from `startMarker` up to `endMarker`. */
function removeGeneratedSection(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0)
    throw new Error(
      `Generated ${label} glue is missing the reviewed ${startMarker.trim()} section.`,
    );
  return source.slice(0, start) + source.slice(end);
}

/**
 * The wasm-bindgen glue reduced to its synchronous offline API: no loader, no async init, no
 * fetch and no import.meta, only initSync.
 */
export function offlineGlue(fullGlue, label) {
  const asyncExport = "\nexport { initSync, __wbg_init as default };";
  const withoutLoader = removeGeneratedSection(
    fullGlue,
    "\nasync function __wbg_load",
    "\nfunction initSync",
    label,
  );
  const glue = removeGeneratedSection(
    withoutLoader,
    "\nasync function __wbg_init",
    asyncExport,
    label,
  )
    .replace(asyncExport, "\nexport { initSync };")
    .replace(
      "__wbg_init.__wbindgen_wasm_module = module;",
      "initSync.__wbindgen_wasm_module = module;",
    );
  if (glue === fullGlue || /\bfetch\s*\(|import\.meta|__wbg_load|\b__wbg_init\b/u.test(glue))
    throw new Error(`Failed to reduce ${label} wasm-bindgen glue to its synchronous offline API.`);
  return glue;
}

/**
 * Runs wasm-bindgen on `compiled` into a staging folder, checks the producer section, and hands
 * the staging folder and the staged module to `finish`; the folder is removed afterwards.
 */
export async function bindgenStaged(
  module,
  compiled,
  toolchain,
  finish,
  { run = runTool, stagingRoot = tmpdir() } = {},
) {
  const staging = mkdtempSync(join(stagingRoot, `ckd-${module.archiveDirectory}-wasm-`));
  try {
    run(
      toolchain.wasmBindgen,
      [compiled, "--target", "web", "--out-dir", staging],
      toolchain.environment,
    );
    const stagedWasm = readFileSync(resolve(staging, `${module.stem}_bg.wasm`));
    assertCanonicalWasmBindgenProducer(stagedWasm, module.label);
    await finish(staging, stagedWasm);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

/** The module of WASM_MODULES whose package is `packageDirectory`. */
export function wasmModule(packageDirectory) {
  const module = WASM_MODULES.find((candidate) => candidate.packageDirectory === packageDirectory);
  if (module === undefined) throw new Error(`No WASM module is listed for ${packageDirectory}.`);
  return module;
}

/**
 * Builds one of the recovery codec modules into its generated/ folder: the module, its offline
 * glue and its declarations. `wasiHeaders` gives C dependencies the wasm32 WASI headers and the
 * getrandom backend of a browser.
 */
export async function buildRecoveryWasm(packageDirectory, { wasiHeaders = false, description }) {
  const module = wasmModule(packageDirectory);
  const toolchain = wasmToolchain((environment) => {
    if (!wasiHeaders) return environment;
    environment.CFLAGS_wasm32_unknown_unknown ??=
      "-I/usr/include/wasm32-wasi -include /usr/include/wasm32-wasi/string.h";
    environment.CARGO_ENCODED_RUSTFLAGS += '\u001f--cfg\u001fgetrandom_backend="wasm_js"';
    return environment;
  });
  const compiled = compileWasmCrate(module, toolchain);
  const generated = resolve(root, "packages", packageDirectory, "generated");
  await bindgenStaged(module, compiled, toolchain, async (staging) => {
    const glue = offlineGlue(
      readFileSync(resolve(staging, `${module.stem}.js`), "utf8"),
      module.label,
    );
    mkdirSync(generated, { recursive: true });
    copyFileSync(
      resolve(staging, `${module.stem}_bg.wasm`),
      resolve(generated, `${module.stem}_bg.wasm`),
    );
    await writeOfflineWasmDeclarations(staging, generated, module.stem, module.label);
    writeFileSync(resolve(generated, `${module.stem}.js`), glue);
  });
  console.log(`Generated pinned ${description} browser WASM.`);
}
