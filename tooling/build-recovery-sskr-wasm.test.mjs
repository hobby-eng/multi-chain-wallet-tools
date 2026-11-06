import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { wipedSskrGlue } from "./build-recovery-sskr-wasm.mjs";

/** The glue that the SSKR engine's producer pinned (packages/recovery-sskr-wasm/integrity.json). */
const PINNED = readFileSync(
  new URL("../packages/recovery-sskr-wasm/generated/recovery_sskr_wasm.js", import.meta.url),
  "utf8",
);

/** The pinned glue as wasm-bindgen writes it, before its secret output is erased. */
function unwiped(glue) {
  return glue
    .replaceAll(
      `        var v2 = getArrayU8FromWasm0(r0, r1);
        try {
            return v2.slice();
        } finally {
            try {
                v2.fill(0);
            } finally {
                wasm.__wbindgen_export2(r0, r1 * 1, 1);
            }
        }`,
      `        var v2 = getArrayU8FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export2(r0, r1 * 1, 1);
        return v2;`,
    )
    .replaceAll(
      `        try {
            if (deferred5_0 !== undefined) {
                getArrayU8FromWasm0(deferred5_0, deferred5_1).fill(0);
            }
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export2(deferred5_0, deferred5_1, 1);
        }`,
      `        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export2(deferred5_0, deferred5_1, 1);`,
    );
}

describe("the SSKR engine's glue, as its producer builds it", () => {
  it("erases the secret output exactly as the pinned glue does", () => {
    const plain = unwiped(PINNED);
    expect(plain).not.toBe(PINNED);
    expect(plain).not.toContain(".fill(0)");
    expect(wipedSskrGlue(plain)).toBe(PINNED);
  });

  it("refuses glue of another shape instead of leaving an output unerased", () => {
    const plain = unwiped(PINNED);
    const oneRecovery = plain.replace("var v2 = getArrayU8FromWasm0(r0, r1).slice();", "");
    expect(() => wipedSskrGlue(oneRecovery)).toThrow(/recovered secrets/u);
    expect(() => wipedSskrGlue(PINNED)).toThrow(/recovered secrets/u);
  });
});
