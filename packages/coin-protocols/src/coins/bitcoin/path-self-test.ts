import type { CoinRegistry } from "../registry-base.js";
import { MAX_BIP32_INDEX } from "@ckd/core/bip32-limits.js";
import { ProtocolMetadataSelfTest } from "../../protocol-metadata-self-test.js";

/** BIP44/49/84/86 path known answers; shared by startup and full self-tests. */
export function runBitcoinPathSelfTest(registry: Pick<CoinRegistry, "COIN_ADAPTERS">): string[] {
  return ProtocolMetadataSelfTest.firstPaths(
    registry,
    [
      ["bitcoin-legacy", "m/44'/0'/0'/0/0"],
      ["bitcoin-nested-segwit", "m/49'/0'/0'/0/0"],
      ["bitcoin-native-segwit", "m/84'/0'/0'/0/0"],
      ["bitcoin-taproot", "m/86'/0'/0'/0/0"],
    ],
    { start: MAX_BIP32_INDEX, count: 2 },
  ).checks;
}
