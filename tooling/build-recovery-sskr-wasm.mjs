import { isMainScript } from "./run-script.mjs";
import { buildRecoveryWasm } from "./wasm-build.mjs";

// MnemoCode's SSKR engine, built here from the same crate as its producer builds it, so that both
// canonical containers give the same bytes, which the intake pins. The erasures below are a copy of
// those in offlineGlue of MnemoCode's scripts/build-sskr-wasm.mjs (kept here as
// packages/recovery-sskr-wasm/producer-recipe/build-sskr-wasm.mjs): a change goes to both.

/** How many entries hand a recovered secret, and how many a share's text, to the host. */
const RECOVERY_ENTRY_POINTS = 2;
const CREATION_ENTRY_POINTS = 2;

/** The glue that copies a recovered secret before freeing its WASM allocation. */
const RECOVERY_OUTPUT = `        var v2 = getArrayU8FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export2(r0, r1 * 1, 1);
        return v2;`;
/** The same, erasing the allocation even where making the host copy fails. */
const WIPED_RECOVERY_OUTPUT = `        var v2 = getArrayU8FromWasm0(r0, r1);
        try {
            return v2.slice();
        } finally {
            try {
                v2.fill(0);
            } finally {
                wasm.__wbindgen_export2(r0, r1 * 1, 1);
            }
        }`;
/** The glue that frees a share's text after the host decoded it. */
const CREATION_OUTPUT = `        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export2(deferred5_0, deferred5_1, 1);`;
/** The same, erasing the text's allocation before it is freed, also after a failed decode. */
const WIPED_CREATION_OUTPUT = `        try {
            if (deferred5_0 !== undefined) {
                getArrayU8FromWasm0(deferred5_0, deferred5_1).fill(0);
            }
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export2(deferred5_0, deferred5_1, 1);
        }`;

/** `text` with each of `count` occurrences of `from` replaced; another count refuses the glue. */
function replacedExactly(text, from, to, count, what) {
  if (text.split(from).length - 1 !== count)
    throw new Error(`The SSKR engine's glue does not have the reviewed shape of its ${what}.`);
  return text.replaceAll(from, to);
}

/** The offline glue of the SSKR engine with its secret output erased, as its producer has it. */
export function wipedSskrGlue(glue) {
  const recovered = replacedExactly(
    glue,
    RECOVERY_OUTPUT,
    WIPED_RECOVERY_OUTPUT,
    RECOVERY_ENTRY_POINTS,
    "recovered secrets",
  );
  return replacedExactly(
    recovered,
    CREATION_OUTPUT,
    WIPED_CREATION_OUTPUT,
    CREATION_ENTRY_POINTS,
    "share texts",
  );
}

if (isMainScript(import.meta.url))
  await buildRecoveryWasm("recovery-sskr-wasm", {
    wasiHeaders: true,
    description: "Blockchain Commons sskr",
    glue: wipedSskrGlue,
  });
