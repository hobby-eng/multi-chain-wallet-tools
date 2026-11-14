// The single-key coins of the Deriver: the coins that bring one module set each, only their paths,
// their key and address forms, their startup vectors and their Wallet Matcher recognizer. The BIP44
// coins derive by BIP32 (packages/coin-protocols/src/coins/bip44-coin.ts), the Ed25519 coins by
// SLIP-10 (coins/ed25519-coin.ts); Hedera has keys of both; Cardano derives by BIP32-Ed25519
// (coin-protocols/src/bip32-ed25519.ts), a payment key and a stake key in its base addresses; Zcash
// has BIP44's transparent keys and ZIP-32's Sapling keys (coin-protocols/src/zip32-sapling.ts). Each
// coin's modules sit at the same places, named by its id, so a build composes any of them from this
// one table.

/** The modules of EIP-191's envelope signing (SHARED_MODULES), which Ethereum's coins share. */
const ENVELOPE_SIGNING = [
  "message-signing-envelope",
  "message-signing-envelope-191",
  "message-signing-recoverable",
];

/**
 * The modules of ADR-036's signing (SHARED_MODULES), which Cosmos and Injective share: the sign
 * document, the secp256k1 signature without a recovery id, the reading of a wallet's response, and
 * the page's texts.
 */
const ADR036_SIGNING = [
  "message-signing-adr036",
  "message-signing-secp256k1",
  "message-signing-public-key",
  "message-signing-response",
  "message-signing-policy-adr036",
];

/**
 * coin id → the names its modules export (its derivation, and its ownership test when a variant
 * offers one, RuntimeCoinAdapter.ownedAddresses), the kinds of derivation it uses, and the shared
 * modules (SHARED_MODULES) its own modules import.
 */
export const SINGLE_KEY_COINS = Object.freeze({
  litecoin: {
    prefix: "LITECOIN",
    derivation: "litecoinDerivation",
    kinds: ["bip44"],
    shared: ["utxo-address", "message-signing-compact"],
  },
  dogecoin: {
    prefix: "DOGECOIN",
    derivation: "dogecoinDerivation",
    kinds: ["bip44"],
    shared: ["utxo-address", "message-signing-compact"],
  },
  "bitcoin-cash": {
    prefix: "BITCOIN_CASH",
    derivation: "bitcoinCashDerivation",
    kinds: ["bip44"],
    shared: ["utxo-address", "message-signing-compact"],
  },
  zcash: {
    prefix: "ZCASH",
    derivation: "zcashDerivation",
    ownership: "zcashOwnership",
    kinds: ["bip44", "zip32-sapling"],
    shared: ["utxo-address", "message-signing-compact"],
  },
  xrp: { prefix: "XRP", derivation: "xrpDerivation", kinds: ["bip44"], shared: [] },
  tron: {
    prefix: "TRON",
    derivation: "tronDerivation",
    kinds: ["bip44"],
    shared: ["keccak-account", ...ENVELOPE_SIGNING],
  },
  "ethereum-classic": {
    prefix: "ETHEREUM_CLASSIC",
    derivation: "ethereumClassicDerivation",
    kinds: ["bip44"],
    shared: ["keccak-account", ...ENVELOPE_SIGNING, "message-signing-policy-evm"],
  },
  cosmos: {
    prefix: "COSMOS",
    derivation: "cosmosDerivation",
    kinds: ["bip44"],
    shared: [...ADR036_SIGNING],
  },
  injective: {
    prefix: "INJECTIVE",
    derivation: "injectiveDerivation",
    kinds: ["bip44"],
    shared: ["keccak-account", ...ADR036_SIGNING, ...ENVELOPE_SIGNING],
  },
  solana: {
    prefix: "SOLANA",
    derivation: "solanaDerivation",
    kinds: ["ed25519"],
    shared: ["slip10-ed25519", "message-signing-ed25519", "message-signing-public-key"],
  },
  stellar: {
    prefix: "STELLAR",
    derivation: "stellarDerivation",
    kinds: ["ed25519"],
    shared: [
      "slip10-ed25519",
      "crc16",
      "message-signing-ed25519",
      "message-signing-public-key",
      "message-signing-response",
    ],
  },
  near: {
    prefix: "NEAR",
    derivation: "nearDerivation",
    kinds: ["ed25519"],
    shared: [
      "slip10-ed25519",
      "message-signing-ed25519",
      "message-signing-public-key",
      "message-signing-response",
    ],
  },
  hedera: {
    prefix: "HEDERA",
    derivation: "hederaDerivation",
    kinds: ["ed25519", "bip44"],
    shared: [
      "slip10-ed25519",
      "keccak-account",
      "message-signing-ed25519",
      "message-signing-secp256k1",
      "message-signing-public-key",
      "message-signing-envelope-191",
      "message-signing-response",
    ],
  },
  ton: {
    prefix: "TON",
    derivation: "tonDerivation",
    kinds: ["ed25519"],
    shared: [
      "slip10-ed25519",
      "crc16",
      "message-signing-ed25519",
      "message-signing-public-key",
      "message-signing-response",
    ],
  },
  cardano: {
    prefix: "CARDANO",
    derivation: "cardanoDerivation",
    kinds: ["bip32-ed25519"],
    shared: [],
  },
});

export const SINGLE_KEY_COIN_IDS = Object.freeze(Object.keys(SINGLE_KEY_COINS));

/** The id of a coin's startup self-test, such as runBitcoinCashDerivationSelfTest. */
export function singleKeySelfTest(coin) {
  const words = coin.split("-").map((word) => `${word[0].toUpperCase()}${word.slice(1)}`);
  return `run${words.join("")}DerivationSelfTest`;
}

/**
 * The public addresses of a single-key coin for the Discovery Scanner: <PREFIX>_ADDRESSES of the
 * Deriver's coin module, which an account coin and an EVM network with its own wallets' layouts
 * (Ethereum Classic) import.
 */
export function singleKeyAddressesModule(coin) {
  return {
    symbol: `${SINGLE_KEY_COINS[coin].prefix}_ADDRESSES`,
    file: singleKeyCoinModules(coin).derivation,
  };
}

/** The repository-relative modules of a single-key coin. */
export function singleKeyCoinModules(coin) {
  return Object.freeze({
    adapters: `packages/coin-protocols/src/coins/adapters/${coin}.ts`,
    derivation: `packages/coin-protocols/src/coins/${coin}/index.ts`,
    selfTest: `packages/verification/src/derivation-self-test-${coin}.ts`,
    matcher: `packages/wallet-recovery/src/matcher-targets-${coin}.ts`,
  });
}

/**
 * TON's phrase, beyond its coin modules: its mnemonic, the page's TON phrase feature (the Telegram
 * wallet's seed and Telegram-compatible generation), the worker's slower key check and TON's check
 * in the wallet-check draw.
 */
export const TON_PHRASE_MODULES = Object.freeze([
  "/crypto-core/src/ton-mnemonic.ts",
  "/crypto-core/src/ton-phrase.ts",
  "/key-derivation/src/ui/ton-phrase-feature.ts",
  "/key-derivation/src/workers/ton-key-self-test.ts",
  "/key-derivation/src/workers/ton-draw-precheck.ts",
]);

/**
 * Cardano's modules beyond its coin modules: the page's readers of its CIP-3 roots, the phrase seed
 * sources of its Icarus variants, and the worker's slower known answers.
 */
export const CARDANO_PAGE_MODULES = Object.freeze([
  "/key-derivation/src/ui/cardano-seed-sources.ts",
  "/key-derivation/src/workers/cardano-key-self-test.ts",
]);

/** Zcash's modules beyond its coin modules: the worker's slower Sapling known answers. */
export const ZCASH_PAGE_MODULES = Object.freeze([
  "/key-derivation/src/workers/zcash-sapling-key-self-test.ts",
]);

/** The graph markers of a single-key coin's own modules, which no build without it may hold. */
export function singleKeyCoinMarkers(coin) {
  return [
    `/coins/${coin}/`,
    `/adapters/${coin}.ts`,
    `derivation-self-test-${coin}.ts`,
    `/wallet-recovery/src/matcher-targets-${coin}.ts`,
    ...(coin === "bitcoin-cash" ? ["/crypto-core/src/cashaddr.ts"] : []),
    ...(coin === "ton" ? TON_PHRASE_MODULES : []),
    ...(coin === "cardano" ? CARDANO_PAGE_MODULES : []),
    ...(coin === "zcash" ? ZCASH_PAGE_MODULES : []),
  ];
}

/**
 * Whether any of `coins` (ids) is a single-key coin of `kind`: "bip44", "ed25519", "bip32-ed25519"
 * or "zip32-sapling".
 */
export function hasSingleKeyKind(hasCoin, kind) {
  return SINGLE_KEY_COIN_IDS.some(
    (coin) => hasCoin(coin) && SINGLE_KEY_COINS[coin].kinds.includes(kind),
  );
}

/**
 * Modules some coins share, beyond the derivation kinds: each with the coins of Bitcoin, Dash and
 * Ethereum that import it too. A build with none of its coins must not hold it.
 */
export const SHARED_MODULES = Object.freeze({
  "utxo-address": { marker: "/coin-protocols/src/utxo-address.ts", ownCoins: ["bitcoin"] },
  "keccak-account": { marker: "/coins/keccak-account.ts", ownCoins: ["ethereum"] },
  "slip10-ed25519": { marker: "/coin-protocols/src/slip10-ed25519.ts", ownCoins: ["dash"] },
  crc16: { marker: "/crypto-core/src/crc16.ts", ownCoins: [] },
  // The compact message signing of the BIP44 coins that sign as Bitcoin Core does; only with
  // message-signing, whose "/message-signing-" marker it also carries.
  "message-signing-compact": { marker: "/coins/message-signing-compact.ts", ownCoins: [] },
  // EIP-191's envelope signing of Ethereum, Ethereum Classic and Tron, also only with
  // message-signing; and the note that Ethereum and Ethereum Classic share.
  "message-signing-envelope": {
    marker: "/coins/message-signing-envelope.ts",
    ownCoins: ["ethereum"],
  },
  "message-signing-envelope-191": {
    marker: "/crypto-core/src/message-signing-envelope-191.ts",
    ownCoins: ["ethereum"],
  },
  "message-signing-recoverable": {
    marker: "/crypto-core/src/message-signing-recoverable.ts",
    ownCoins: ["ethereum"],
  },
  "message-signing-policy-evm": {
    marker: "/message-signing-policy-evm.ts",
    ownCoins: ["ethereum"],
  },
  // The Ed25519 message signing of Solana, Stellar, NEAR, TON and Hedera's Ed25519 rows, only with
  // message-signing; and the reading of a wallet's response, which every account coin but Solana
  // shares.
  "message-signing-ed25519": { marker: "/coins/message-signing-ed25519.ts", ownCoins: [] },
  // The signing against a public key that the Ed25519 coins and the secp256k1 standards without a
  // recovery id share.
  "message-signing-public-key": { marker: "/coins/message-signing-public-key.ts", ownCoins: [] },
  "message-signing-response": { marker: "/coins/message-signing-response.ts", ownCoins: [] },
  // The secp256k1 signatures without a recovery id of ADR-036 and Hedera's ECDSA rows, and
  // ADR-036's sign document of Cosmos and Injective, also only with message-signing.
  "message-signing-secp256k1": { marker: "/coins/message-signing-secp256k1.ts", ownCoins: [] },
  "message-signing-adr036": { marker: "/coins/message-signing-adr036.ts", ownCoins: [] },
  "message-signing-policy-adr036": { marker: "/message-signing-policy-adr036.ts", ownCoins: [] },
});

/** Whether a build with the coins `hasCoin` admits needs the shared module `name`. */
export function needsSharedModule(hasCoin, name) {
  return (
    SHARED_MODULES[name].ownCoins.some((coin) => hasCoin(coin)) ||
    SINGLE_KEY_COIN_IDS.some(
      (coin) => hasCoin(coin) && SINGLE_KEY_COINS[coin].shared.includes(name),
    )
  );
}

/** The modules a kind of single-key coin shares, which a build with none of its coins must not hold. */
export const SINGLE_KEY_SHARED_MARKERS = Object.freeze({
  bip44: Object.freeze([
    "/coins/bip44-coin.ts",
    "/coins/bip44-coin-profile.ts",
    "/adapters/bip44-coin.ts",
  ]),
  ed25519: Object.freeze([
    "/coins/ed25519-coin.ts",
    "/coins/ed25519-coin-profile.ts",
    "/adapters/ed25519-coin.ts",
  ]),
  // Cardano's keys; coin-protocols/src/ed25519-hd-common.ts, which SLIP-10 shares, has no marker.
  "bip32-ed25519": Object.freeze([
    "/coin-protocols/src/bip32-ed25519.ts",
    "/crypto-core/src/cardano-icarus.ts",
    "/crypto-core/src/cardano-root.ts",
  ]),
  // Zcash's Sapling keys.
  "zip32-sapling": Object.freeze(["/coin-protocols/src/zip32-sapling.ts"]),
  any: Object.freeze([
    "/coins/coin-variant.ts",
    "/coins/single-key-path-self-test.ts",
    "/verification/src/single-key-coin-self-test.ts",
    "/wallet-recovery/src/matcher-targets-single-key.ts",
  ]),
});
