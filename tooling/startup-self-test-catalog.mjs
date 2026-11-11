// Deliberate copy: this verification oracle must be independent of the code and report it checks.
// Admit a new check deliberately here; never build expectations from a self-test's returned list.
const BIP39 = Object.freeze([
  "BIP39",
  "BIP39 passphrase NFKD (Unicode 18.0.0)",
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
  "dash-identity-funding mainnet path metadata",
  "dash-identity-funding path boundary refusal",
  "dash-dashpay mainnet path metadata",
  "dash-dashpay path boundary refusal",
  "dash-masternode mainnet path metadata",
  "dash-masternode path boundary refusal",
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
  "Dash identity registration funding testnet / DIP13",
  "Dash identity top-up funding testnet / DIP13",
  "Dash invitation funding (hardened) testnet / DIP13",
  "Dash DashPay friendship testnet / DIP15",
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
// The single-key coins (packages/verification/src/single-key-coin-self-test.ts), in the order the
// self-test runs them, not the Coin menu's (coin-order.ts).
const LITECOIN = Object.freeze([
  "litecoin-legacy mainnet path metadata",
  "litecoin-legacy path boundary refusal",
  "litecoin-nested-segwit mainnet path metadata",
  "litecoin-nested-segwit path boundary refusal",
  "litecoin-native-segwit mainnet path metadata",
  "litecoin-native-segwit path boundary refusal",
  "Litecoin Legacy · BIP44 / P2PKH",
  "Litecoin Nested SegWit · BIP49 / P2SH-P2WPKH",
  "Litecoin Native SegWit · BIP84 / P2WPKH",
  "Litecoin master/account extended-key integrity",
]);
const DOGECOIN = Object.freeze([
  "dogecoin mainnet path metadata",
  "dogecoin path boundary refusal",
  "Dogecoin BIP44 / P2PKH",
  "Dogecoin master/account extended-key integrity",
]);
const BITCOIN_CASH = Object.freeze([
  "bitcoin-cash mainnet path metadata",
  "bitcoin-cash path boundary refusal",
  "bitcoin-cash-coin-type-0 mainnet path metadata",
  "bitcoin-cash-coin-type-0 path boundary refusal",
  "Bitcoin Cash BIP44 · coin type 145 / P2PKH",
  "Bitcoin Cash BIP44 · coin type 0 / P2PKH",
  "Bitcoin Cash master/account extended-key integrity",
]);
const ZCASH = Object.freeze([
  "zcash mainnet path metadata",
  "zcash path boundary refusal",
  "Zcash Transparent · BIP44 / P2PKH",
  "Zcash master/account extended-key integrity",
]);
const XRP = Object.freeze([
  "xrp mainnet path metadata",
  "xrp path boundary refusal",
  "XRP BIP44",
  "XRP master/account extended-key integrity",
]);
const TRON = Object.freeze([
  "tron mainnet path metadata",
  "tron path boundary refusal",
  "Tron BIP44",
  "Tron master/account extended-key integrity",
]);
const ETHEREUM_CLASSIC = Object.freeze([
  "ethereum-classic mainnet path metadata",
  "ethereum-classic path boundary refusal",
  "Ethereum Classic BIP44 · coin type 61",
  "Ethereum Classic master/account extended-key integrity",
  "Ethereum Classic Ledger legacy · m/44'/60'/160720'/0'/i",
]);
const COSMOS = Object.freeze([
  "cosmos mainnet path metadata",
  "cosmos path boundary refusal",
  "Cosmos BIP44",
  "Cosmos master/account extended-key integrity",
]);
const INJECTIVE = Object.freeze([
  "injective mainnet path metadata",
  "injective path boundary refusal",
  "Injective BIP44 · coin type 60",
  "Injective master/account extended-key integrity",
]);
const SOLANA = Object.freeze([
  "solana mainnet path metadata",
  "solana path boundary refusal",
  "solana-ledger mainnet path metadata",
  "solana-ledger path boundary refusal",
  "Solana Phantom, Solflare · m/44'/501'/i'/0'",
  "Solana Ledger · m/44'/501'/i'",
]);
const STELLAR = Object.freeze([
  "stellar mainnet path metadata",
  "stellar path boundary refusal",
  "Stellar SEP-0005 · m/44'/148'/i'",
]);
const NEAR = Object.freeze([
  "near mainnet path metadata",
  "near path boundary refusal",
  "NEAR m/44'/397'/i'",
]);
const HEDERA = Object.freeze([
  "hedera mainnet path metadata",
  "hedera path boundary refusal",
  "hedera-ecdsa mainnet path metadata",
  "hedera-ecdsa path boundary refusal",
  "Hedera Ed25519 · m/44'/3030'/0'/0'/i'",
  "Hedera ECDSA · BIP44",
  "Hedera master/account extended-key integrity",
]);
const TON = Object.freeze([
  "ton mainnet path metadata",
  "ton path boundary refusal",
  "ton-trust mainnet path metadata",
  "ton-trust path boundary refusal",
  "ton-ledger mainnet path metadata",
  "ton-ledger path boundary refusal",
  "TON Trust Wallet · m/44'/607'/i'",
  "TON Ledger · m/44'/607'/0'/0'/i'/0'",
  "TON phrase check and wallet contracts W5, v4R2, v3R2",
]);
const MULTI_CHAIN = Object.freeze({
  entry: "packages/verification/src/self-test.ts",
  run: "runCryptoSelfTest",
  label: "startup cryptographic self-test",
  expectedChecks: Object.freeze([
    ...BIP39,
    ...BITCOIN,
    ...DASH,
    ...ETHEREUM,
    ...LITECOIN,
    ...DOGECOIN,
    ...BITCOIN_CASH,
    ...ZCASH,
    ...XRP,
    ...TRON,
    ...ETHEREUM_CLASSIC,
    ...COSMOS,
    ...INJECTIVE,
    ...SOLANA,
    ...STELLAR,
    ...NEAR,
    ...HEDERA,
    ...TON,
  ]),
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
