// The SSKR library (Blockchain Commons sskr, built to WASM in packages/recovery-sskr-wasm) as an
// object made from its WASM bytes. The bytes are a parameter rather than an import, so that a
// worker can be handed the page's copy: the artifact embeds each WASM module exactly once
// (apps/key-derivation/scripts/verify-key-derivation-artifact.mjs).
import {
  ShareEncoding,
  create_sskr_shares_formatted,
  initSync,
  recover_sskr_shares_formatted,
} from "@ckd/recovery-sskr-wasm/recovery_sskr_wasm.js";
import { SskrGroupPolicy, type SskrGroupSpec } from "./sskr-groups.js";

export type SskrShareEncoding = "compact-ur" | "bytewords";

// The bridge's own codes (its ShareEncoding export). Its entries take the code as a number, so
// that a wrong one is refused inside the entry, which then wipes the secret.
const SSKR_ENCODING: Readonly<Record<SskrShareEncoding, number>> = {
  "compact-ur": ShareEncoding.CompactUr,
  bytewords: ShareEncoding.Bytewords,
};

function encodingCode(encoding: SskrShareEncoding): number {
  // Own keys only: a plain lookup also finds "toString" or "constructor" on Object.prototype, and
  // WebAssembly reads such a value as 0, Compact UR (AUD-019-API002).
  if (!Object.hasOwn(SSKR_ENCODING, encoding))
    throw new Error(`Unsupported SSKR share encoding: ${String(encoding)}.`);
  return SSKR_ENCODING[encoding];
}

// The wasm-bindgen glue keeps one module instance per JavaScript realm (page or worker).
let initialized = false;

export class SskrCodec {
  constructor(wasmBytes: Uint8Array<ArrayBuffer>) {
    if (initialized) return;
    initSync({ module: wasmBytes });
    initialized = true;
  }

  /**
   * Shares of `secret` in `groups`, `groupThreshold` of the groups needed. `seed` is SEED_BYTES of
   * fresh randomness from the caller, who wipes it.
   */
  create(
    secret: Uint8Array,
    groupThreshold: number,
    groups: readonly SskrGroupSpec[],
    seed: Uint8Array,
    encoding: SskrShareEncoding = "compact-ur",
  ): string[] {
    const policy = new SskrGroupPolicy(groupThreshold, groups);
    return create_sskr_shares_formatted(
      secret,
      policy.groupThreshold,
      policy.pack(),
      seed,
      encodingCode(encoding),
    ).split("\n");
  }

  /** The secret that `shares` restore; refused unless they meet every threshold. */
  recover(shares: readonly string[], encoding: SskrShareEncoding = "compact-ur"): Uint8Array {
    return recover_sskr_shares_formatted(shares.join("\n"), encodingCode(encoding));
  }
}
