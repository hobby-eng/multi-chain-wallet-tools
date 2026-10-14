import { verifySelfTest } from "./self-test-check.mjs";

await verifySelfTest({
  entry: "packages/verification/src/derivation-self-test-dash.ts",
  run: "runDashDerivationSelfTest",
  label: "Dash Community startup self-test",
  expectedChecks: [
    "Dash Core / BIP44",
    "Dash Core testnet / BIP44",
    "Dash Platform / DIP17",
    "Dash Platform testnet / DIP17",
    "Dash master/account extended-key integrity",
    "Dash Identity mainnet / DIP13",
    "Dash Identity testnet / DIP13",
    "Dash Mobile CoinJoin · DIP9 · mainnet",
    "Dash Mobile CoinJoin · DIP9 · testnet",
    "Dash Orchard testnet / ZIP32",
    "Dash Orchard mainnet / ZIP32",
  ],
});
