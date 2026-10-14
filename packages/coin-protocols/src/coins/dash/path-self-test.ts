import type { CoinRegistry } from "../registry-base.js";
import { FIRST_MAINNET_PATH, ProtocolMetadataSelfTest } from "../../protocol-metadata-self-test.js";

/** DIP9/13/17, BIP44 and the existing wallet/ZIP-32 paths, without cryptographic imports. */
export function runDashPathSelfTest(registry: Pick<CoinRegistry, "COIN_ADAPTERS">): string[] {
  const check = ProtocolMetadataSelfTest.firstPaths(
    registry,
    [
      ["dash-core", "m/44'/5'/0'/0/0"],
      ["dash-core-coinjoin", "m/9'/5'/4'/0'/0/0"],
      ["dash-legacy-mobile", "m/0'/0/0"],
      ["dash-multisig-p2sh", "m/48'/5'/0'/0'/0/0"],
      ["dash-multisig-core-pkh", "m/44'/5'/0'/0/0"],
      ["dash-platform", "m/9'/5'/17'/0'/0'/0"],
      ["dash-identity", "m/9'/5'/5'/0'/0'/0'/{0'…3'}"],
      ["dash-shielded", "m/32'/5'/0' · external diversifier 0"],
    ],
    { start: -1 },
  );
  check.path(
    "dash-core-coinjoin",
    { ...FIRST_MAINNET_PATH, network: "testnet", branch: 1 },
    "m/9'/1'/4'/0'/1/0",
  );
  check.refusal("dash-core-coinjoin", { ...FIRST_MAINNET_PATH, branch: 2 });
  return check.checks;
}
