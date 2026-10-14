// The page's SSKR library, made from the WASM module that the build embeds, and the share
// functions of the SSKR panel and the startup check.
import { secureRandomBytes } from "@ckd/core/secure-random.js";
import wasmBytes from "@ckd/recovery-sskr-wasm/recovery_sskr_wasm_bg.wasm";
import { SskrCodec, type SskrShareEncoding } from "./sskr-codec.js";
import type { SskrGroupSpec } from "./sskr-groups.js";
import { SEED_BYTES } from "../../recovery-mnemocode/source/sskr/share-platform.js";

export type { SskrShareEncoding } from "./sskr-codec.js";
export type { SskrGroupSpec } from "./sskr-groups.js";

// esbuild's binary loader gives the module's bytes (packages/build-security/types/wasm.d.ts); the
// .d.ts that wasm-bindgen writes beside the file describes an instantiated module instead.
const embeddedWasm = wasmBytes as unknown as Uint8Array<ArrayBuffer>;

let codec: SskrCodec | undefined;

/** The SSKR library of this page, set up on first use. */
export function sskrCodec(): SskrCodec {
  codec ??= new SskrCodec(embeddedWasm);
  return codec;
}

/** A copy of the embedded WASM module, for a worker that runs the SSKR library itself. */
export function sskrWasmBytes(): Uint8Array<ArrayBuffer> {
  return new Uint8Array(embeddedWasm);
}

export function createSskrShares(
  secret: Uint8Array,
  groupThreshold: number,
  groups: readonly SskrGroupSpec[],
  encoding: SskrShareEncoding = "compact-ur",
): string[] {
  const random = secureRandomBytes(SEED_BYTES);
  try {
    return sskrCodec().create(secret, groupThreshold, groups, random, encoding);
  } finally {
    random.fill(0);
  }
}

export function recoverSskrShares(
  shares: readonly string[],
  encoding: SskrShareEncoding = "compact-ur",
): Uint8Array {
  return sskrCodec().recover(shares, encoding);
}
