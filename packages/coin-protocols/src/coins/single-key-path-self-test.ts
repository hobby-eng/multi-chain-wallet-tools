import { MAX_BIP32_INDEX } from "@ckd/core/bip32-limits.js";
import { ProtocolMetadataSelfTest } from "../protocol-metadata-self-test.js";
import type { CoinAdapter } from "./registry-base.js";

/** Each single-key variant's known first path, and its refusal of a range past the last index. */
export function runSingleKeyPathSelfTest(
  adapters: readonly CoinAdapter[],
  cases: readonly (readonly [id: string, expected: string])[],
): string[] {
  return ProtocolMetadataSelfTest.firstPaths({ COIN_ADAPTERS: adapters }, cases, {
    start: MAX_BIP32_INDEX,
    count: 2,
  }).checks;
}
