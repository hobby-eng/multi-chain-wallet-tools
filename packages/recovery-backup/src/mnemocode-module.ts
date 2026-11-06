// The page's MnemoCode: the WebAssembly file of its profile, which the build embeds as bytes,
// compiled once; the startup checks load it, and a search worker is given the compiled module.
import wasmBytes from "@ckd/mnemocode-wasm/mnemocode.wasm";
import { instantiateMnemoCode, type MnemoCodeBinding } from "./mnemocode-engine.js";

let compiling: Promise<WebAssembly.Module> | undefined;
let compiled: WebAssembly.Module | undefined;

/** The page's compiled MnemoCode module, compiled once. */
function mnemocodeModule(): Promise<WebAssembly.Module> {
  compiling ??= WebAssembly.compile(wasmBytes).then((module) => (compiled = module));
  return compiling;
}

/** Compiles and instantiates MnemoCode in the page, once; the startup checks call it first. */
export async function loadMnemoCode(): Promise<MnemoCodeBinding> {
  return instantiateMnemoCode(await mnemocodeModule());
}

/**
 * The compiled module that a worker instantiates, at once: the page loaded MnemoCode before any
 * feature that starts a worker runs.
 */
export function compiledMnemoCode(): WebAssembly.Module {
  if (compiled === undefined) throw new Error("MnemoCode is not loaded yet.");
  return compiled;
}
