// Deliberate copy: this verification oracle must be independent of the code and report it checks.
// Admit a new check deliberately here; never build expectations from a self-test's returned list.
const BIP39 = Object.freeze([
  "BIP39",
  "BIP39 chosen words",
  "BIP39 chosen-word bit placement and readback (five lengths)",
  "BIP39 chosen-word checksum, predicates and refusals (five lengths)",
]);
const BITCOIN = Object.freeze([
  "bitcoin-legacy mainnet path metadata",
  "bitcoin-legacy path boundary refusal",
  "bitcoin-nested-segwit mainnet path metadata",
  "bitcoin-nested-segwit path boundary refusal",
  "bitcoin-native-segwit mainnet path metadata",
  "bitcoin-native-segwit path boundary refusal",
  "bitcoin-taproot mainnet path metadata",
  "bitcoin-taproot path boundary refusal",
  "Bitcoin legacy",
  "Bitcoin nested-segwit",
  "Bitcoin native-segwit",
  "Bitcoin taproot",
  "Bitcoin testnet / BIP49",
  "Bitcoin maximum child index",
  "Bitcoin master/account extended-key integrity",
]);
const DASH = Object.freeze([
  "dash-core mainnet path metadata",
  "dash-core path boundary refusal",
  "dash-core-coinjoin mainnet path metadata",
  "dash-core-coinjoin path boundary refusal",
  "dash-legacy-mobile mainnet path metadata",
  "dash-legacy-mobile path boundary refusal",
  "dash-multisig-p2sh mainnet path metadata",
  "dash-multisig-p2sh path boundary refusal",
  "dash-multisig-core-pkh mainnet path metadata",
  "dash-multisig-core-pkh path boundary refusal",
  "dash-platform mainnet path metadata",
  "dash-platform path boundary refusal",
  "dash-identity mainnet path metadata",
  "dash-identity path boundary refusal",
  "dash-shielded mainnet path metadata",
  "dash-shielded path boundary refusal",
  "dash-core-coinjoin testnet path metadata",
  // Distinct invalid-start and invalid-branch cases deliberately have the same public label.
  "dash-core-coinjoin path boundary refusal",
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
]);
const ETHEREUM = Object.freeze([
  "ethereum mainnet path metadata",
  "ethereum testnet path metadata",
  "ethereum path boundary refusal",
  "Ethereum / EIP55",
  "Ethereum master/account extended-key integrity",
]);
const MULTI_CHAIN = Object.freeze({
  entry: "packages/verification/src/self-test.ts",
  run: "runCryptoSelfTest",
  label: "startup cryptographic self-test",
  expectedChecks: Object.freeze([...BIP39, ...BITCOIN, ...DASH, ...ETHEREUM]),
});
const DASH_COMMUNITY = Object.freeze({
  entry: "packages/verification/src/derivation-self-test-dash.ts",
  run: "runDashDerivationSelfTest",
  label: "Dash Community startup self-test",
  expectedChecks: DASH,
});

/** Owns the independently reviewed exact startup inventories, including case multiplicity. */
export class StartupSelfTestCatalog {
  /** All supported coins plus the BIP39 checks of the Multi-Chain Edition. */
  static get multiChain() {
    return MULTI_CHAIN;
  }

  /** Dash-only worker checks; excludes BIP39, Bitcoin and Ethereum. */
  static get dashCommunity() {
    return DASH_COMMUNITY;
  }
}
