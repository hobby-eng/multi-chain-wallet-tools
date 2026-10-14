import type { CoinRegistry } from "../registry-base.js";
import { ProtocolMetadataSelfTest } from "../../protocol-metadata-self-test.js";

/** BIP44 EOA metadata retains coin type 60 on every chain. */
export function runEthereumPathSelfTest(registry: Pick<CoinRegistry, "COIN_ADAPTERS">): string[] {
  const check = new ProtocolMetadataSelfTest(registry);
  const input = { network: "mainnet" as const, account: 1, branch: 1, start: 2, count: 1 };
  check.path("ethereum", input, "m/44'/60'/1'/1/2");
  check.path("ethereum", { ...input, network: "testnet" }, "m/44'/60'/1'/1/2");
  check.refusal("ethereum", { ...input, branch: 2 });
  return check.checks;
}
