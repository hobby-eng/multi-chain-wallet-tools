import { hexToBytes } from "@ckd/core/crypto.js";
import { ETHEREUM_CLASSIC_COIN_ADAPTERS } from "@ckd/coins/adapters/ethereum-classic.js";
import {
  ETHEREUM_CLASSIC_ADDRESSES,
  ethereumClassicDerivation,
} from "@ckd/coins/ethereum-classic/index.js";
import { ETHEREUM_CLASSIC_LEDGER_LEGACY } from "@ckd/coins/ethereum-classic/profiles.js";
import { ABANDON_ABOUT_SEED_HEX, expectEqual } from "./helpers.js";
import { firstPublicAddress, singleKeyCoinSelfTest } from "./single-key-coin-self-test.js";

// The first addresses of the public phrase, which MnemoCode's own Rust derivation finds at the same
// paths, and the account keys, which test/oracles/bip32_oracle.py recomputes independently
// (packages/coin-protocols/tests/bip44-coins.test.ts).

/** The name of the known answer of Ledger's legacy Ethereum Classic path. */
const LEDGER_LEGACY_CHECK = "Ethereum Classic Ledger legacy · m/44'/60'/160720'/0'/i";

/**
 * The first address of Ledger's legacy Ethereum Classic path m/44'/60'/160720'/0'/0, which the
 * Deriver has no row of and only the Discovery Scanner's public addresses derive. The value comes
 * from test/oracles/bip32_oracle.py's BIP32 with a separate Keccak-256 that first reproduces the
 * phrase's MetaMask and Ethereum Classic BIP44 addresses (2026-11-11).
 */
function checkLedgerLegacy(): string {
  const seed = hexToBytes(ABANDON_ABOUT_SEED_HEX);
  try {
    expectEqual(
      LEDGER_LEGACY_CHECK,
      firstPublicAddress(ETHEREUM_CLASSIC_ADDRESSES, ETHEREUM_CLASSIC_LEDGER_LEGACY.id, seed),
      "0x4C067164DFD49d0b8B63A466296667683202e43B",
    );
  } finally {
    seed.fill(0);
  }
  return LEDGER_LEGACY_CHECK;
}

/** Ethereum Classic's worker vectors, for every edition and selective build that has it. */
export const runEthereumClassicDerivationSelfTest = singleKeyCoinSelfTest({
  group: "Ethereum Classic",
  adapters: ETHEREUM_CLASSIC_COIN_ADAPTERS,
  derivation: ethereumClassicDerivation,
  addresses: ETHEREUM_CLASSIC_ADDRESSES,
  vectors: [
    {
      adapterId: "ethereum-classic",
      path: "m/44'/61'/0'/0/0",
      address: "0xFA22515E43658ce56A7682B801e9B5456f511420",
      accountXpub:
        "xpub6CqTNrUVV95XgHEP2LVe42cdpWKh2jeA4GnyXrQ219wJJVPAFajkbuFEdzf6xfGgdJWrhKuK5p8v47vxVQHFGU85J1J8Di95Z6hFJx8GhYz",
    },
  ],
  checks: [checkLedgerLegacy],
});
