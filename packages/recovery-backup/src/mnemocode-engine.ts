// MnemoCode in this realm: the wasm-bindgen glue of the page's one WebAssembly file (MnemoCode ADR
// 0007, packages/recovery-mnemocode-wasm), instantiated from a compiled module. The page compiles
// the file it embeds (mnemocode-module.ts); a worker that runs a search is given that module and
// instantiates its own, so that the file's bytes are embedded once.
//
// The binding's contract: after a WebAssembly.RuntimeError (a trap, panic = "abort") the instance
// holds whatever it was working on and must not be used again. The glue keeps one instance per
// realm, so the page cannot drop it: every export is guarded, and after a trap MnemoCode refuses
// every call until the page is loaded again.
import * as glue from "@ckd/mnemocode-wasm/mnemocode.js";

export type MnemoCodeBinding = Omit<typeof glue, "initSync">;

const TRAPPED =
  "MnemoCode stopped after an internal error and is off until the page is loaded again.";

let binding: MnemoCodeBinding | undefined;
let trapped: unknown;
/** What waits for MnemoCode to be loaded, such as a choice filled from its coins. */
const waiting: ((binding: MnemoCodeBinding) => void)[] = [];

function refuseIfTrapped(): void {
  if (trapped !== undefined) throw new Error(TRAPPED, { cause: trapped });
}

function guard<T extends (...args: never[]) => unknown>(call: T): T {
  return function (this: unknown, ...args: Parameters<T>) {
    refuseIfTrapped();
    try {
      return call.apply(this, args);
    } catch (cause) {
      if (cause instanceof WebAssembly.RuntimeError) {
        trapped = cause;
        throw new Error(TRAPPED, { cause });
      }
      throw cause;
    }
  } as T;
}

/** Wraps every function, method, static method and getter of a class in place. */
function guardClass(type: abstract new (...args: never[]) => unknown): void {
  for (const target of [type, type.prototype as object]) {
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(target))) {
      if (key === "constructor" || key === "prototype" || key === "length" || key === "name")
        continue;
      if (typeof descriptor.value === "function")
        Object.defineProperty(target, key, { ...descriptor, value: guard(descriptor.value) });
      else if (descriptor.get !== undefined)
        Object.defineProperty(target, key, { ...descriptor, get: guard(descriptor.get) });
    }
  }
}

/** Instantiates MnemoCode in this realm from `module` (the page's, or one a worker was given). */
export function instantiateMnemoCode(module: WebAssembly.Module): MnemoCodeBinding {
  if (binding !== undefined) return binding;
  glue.initSync({ module });
  const guarded: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(glue)) {
    if (name === "initSync" || typeof value !== "function") continue;
    // A class of the binding has a prototype of its own methods; a free function has none.
    if (/^[A-Z]/u.test(name)) {
      guardClass(value as abstract new (...args: never[]) => unknown);
      guarded[name] = value;
    } else guarded[name] = guard(value as (...args: never[]) => unknown);
  }
  const loaded = Object.freeze(guarded) as unknown as MnemoCodeBinding;
  binding = loaded;
  for (const use of waiting.splice(0)) use(loaded);
  return loaded;
}

/** Runs `use` with MnemoCode once it is loaded: at once if it is. */
export function whenMnemoCodeLoaded(use: (binding: MnemoCodeBinding) => void): void {
  if (binding === undefined) waiting.push(use);
  else use(binding);
}

/**
 * Where MnemoCode is in this realm: still loading, ready to answer, or stopped by an internal
 * error until the page is loaded again.
 */
export function mnemocodeState(): "loading" | "ready" | "stopped" {
  if (trapped !== undefined) return "stopped";
  return binding === undefined ? "loading" : "ready";
}

/** MnemoCode, once the startup checks loaded it; every feature that uses it runs after them. */
export function mnemocode(): MnemoCodeBinding {
  refuseIfTrapped();
  if (binding === undefined) throw new Error("MnemoCode is not loaded yet.");
  return binding;
}

/** The refusal code of a MnemoCode error, if it is one. */
export function mnemocodeCode(error: unknown): string | undefined {
  if (!(error instanceof Error) || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}
