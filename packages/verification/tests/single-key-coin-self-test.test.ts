import { describe, expect, it } from "vitest";
import { XRP_COIN_ADAPTERS } from "@ckd/coins/adapters/xrp.js";
import { bip44CoinAddresses } from "@ckd/coins/bip44-coin.js";
import { TRON_KEYS } from "@ckd/coins/tron/index.js";
import { XRP_PROFILES } from "@ckd/coins/xrp/profiles.js";
import { xrpDerivation } from "@ckd/coins/xrp/index.js";
import { runNearDerivationSelfTest } from "../src/derivation-self-test-near.js";
import { runSolanaDerivationSelfTest } from "../src/derivation-self-test-solana.js";
import { runStellarDerivationSelfTest } from "../src/derivation-self-test-stellar.js";
import { runTronDerivationSelfTest } from "../src/derivation-self-test-tron.js";
import { runXrpDerivationSelfTest } from "../src/derivation-self-test-xrp.js";
import { singleKeyCoinSelfTest } from "../src/single-key-coin-self-test.js";

describe("the account coins' startup self-tests", () => {
  it.each([
    runSolanaDerivationSelfTest,
    runXrpDerivationSelfTest,
    runStellarDerivationSelfTest,
    runNearDerivationSelfTest,
    runTronDerivationSelfTest,
  ])("pass with the Deriver's rows and the connected tools' public addresses", async (run) => {
    expect((await run()).passed).toBe(true);
  });

  it("fails when the public address of a vector differs from its row", async () => {
    // XRP's layouts with Tron's address encoding: the rows' addresses still match the vector.
    const selfTest = singleKeyCoinSelfTest({
      group: "XRP",
      adapters: XRP_COIN_ADAPTERS,
      derivation: xrpDerivation,
      addresses: bip44CoinAddresses(XRP_PROFILES, TRON_KEYS),
      vectors: [
        {
          adapterId: "xrp",
          path: "m/44'/144'/0'/0/0",
          address: "rHsMGQEkVNJmpGWs8XUBoTBiAAbwxZN5v3",
        },
      ],
    });
    await expect(selfTest()).rejects.toThrow(
      "Cryptographic self-test failed: XRP BIP44 public address.",
    );
  });
});
