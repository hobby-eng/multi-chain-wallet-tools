import { deriveEthereum } from "@ckd/coins/ethereum/index.js";
import { ETHEREUM_COIN_ADAPTERS } from "@ckd/coins/adapters/ethereum.js";
import { runEthereumPathSelfTest } from "@ckd/coins/ethereum/path-self-test.js";
import { checkDerivationVectors, firstAddressOf, now } from "./helpers.js";
import type { CryptoSelfTestReport } from "./types.js";

/** Ethereum-only worker vectors for selectively composed offline artifacts. */
export async function runEthereumDerivationSelfTest(): Promise<CryptoSelfTestReport> {
  const started = now();
  const pathChecks = runEthereumPathSelfTest({ COIN_ADAPTERS: ETHEREUM_COIN_ADAPTERS });
  const checks = checkDerivationVectors(
    [
      {
        name: "Ethereum / EIP55",
        derive: (seed) => deriveEthereum(firstAddressOf(seed, "mainnet")),
        address: "0x9858EfFD232B4033E47d90003D41EC34EcaEda94",
        accountXpub:
          "xpub6DCoCpSuQZB2jawqnGMEPS63ePKWkwWPH4TU45Q7LPXWuNd8TMtVxRrgjtEshuqpK3mdhaWHPFsBngh5GFZaM6si3yZdUsT8ddYM3PwnATt",
      },
    ],
    "Ethereum master/account extended-key integrity",
  );
  checks.unshift(...pathChecks);
  return { passed: true, checks, durationMs: Math.round(now() - started) };
}
