import { BITCOIN_CASH_COIN_ADAPTERS } from "@ckd/coins/adapters/bitcoin-cash.js";
import { bitcoinCashDerivation } from "@ckd/coins/bitcoin-cash/index.js";
import { singleKeyCoinSelfTest } from "./single-key-coin-self-test.js";

// The first addresses of the public phrase, which MnemoCode's own Rust derivation finds at the same
// paths, and the account keys, which test/oracles/bip32_oracle.py recomputes independently
// (packages/coin-protocols/tests/bip44-coins.test.ts).

/** Bitcoin Cash's worker vectors, for every edition and selective build that has it. */
export const runBitcoinCashDerivationSelfTest = singleKeyCoinSelfTest({
  group: "Bitcoin Cash",
  adapters: BITCOIN_CASH_COIN_ADAPTERS,
  derivation: bitcoinCashDerivation,
  vectors: [
    {
      adapterId: "bitcoin-cash",
      path: "m/44'/145'/0'/0/0",
      address: "bitcoincash:qqyx49mu0kkn9ftfj6hje6g2wfer34yfnq5tahq3q6",
      accountXpub:
        "xpub6ByHsPNSQXTWZ7PLESMY2FufyYWtLXagSUpMQq7Un96SiThZH2iJB1X7pwviH1WtKVeDP6K8d6xxFzzoaFzF3s8BKCZx8oEDdDkNnp4owAZ",
    },
    {
      adapterId: "bitcoin-cash-coin-type-0",
      path: "m/44'/0'/0'/0/0",
      address: "bitcoincash:qrvcdmgpk73zyfd8pmdl9wnuld36zh9n4gms8s0u59",
    },
  ],
});
