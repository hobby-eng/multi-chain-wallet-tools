// The single-key coins of the Deriver: one key per address, each coin only its paths, its key and
// address forms, its startup vectors and its Wallet Matcher recognizer. The BIP44 coins derive by
// BIP32 (packages/coin-protocols/src/coins/bip44-coin.ts), the Ed25519 coins by SLIP-10
// (coins/ed25519-coin.ts); Hedera has keys of both. Each coin's modules sit at the same places,
// named by its id, so a build composes any of them from this one table.

/**
 * coin id → the names its modules export, the kinds of derivation it uses, and the shared modules
 * (SHARED_MODULES) its own modules import.
 */
export const SINGLE_KEY_COINS = Object.freeze({
  litecoin: {
    prefix: "LITECOIN",
    derivation: "litecoinDerivation",
    kinds: ["bip44"],
    shared: ["utxo-address"],
  },
  dogecoin: {
    prefix: "DOGECOIN",
    derivation: "dogecoinDerivation",
    kinds: ["bip44"],
    shared: ["utxo-address"],
  },
  "bitcoin-cash": {
    prefix: "BITCOIN_CASH",
    derivation: "bitcoinCashDerivation",
    kinds: ["bip44"],
    shared: ["utxo-address"],
  },
  zcash: {
    prefix: "ZCASH",
    derivation: "zcashDerivation",
    kinds: ["bip44"],
    shared: ["utxo-address"],
  },
  xrp: { prefix: "XRP", derivation: "xrpDerivation", kinds: ["bip44"], shared: [] },
  tron: {
    prefix: "TRON",
    derivation: "tronDerivation",
    kinds: ["bip44"],
    shared: ["keccak-account"],
  },
  "ethereum-classic": {
    prefix: "ETHEREUM_CLASSIC",
    derivation: "ethereumClassicDerivation",
    kinds: ["bip44"],
    shared: ["keccak-account"],
  },
  cosmos: { prefix: "COSMOS", derivation: "cosmosDerivation", kinds: ["bip44"], shared: [] },
  injective: {
    prefix: "INJECTIVE",
    derivation: "injectiveDerivation",
    kinds: ["bip44"],
    shared: ["keccak-account"],
  },
  solana: {
    prefix: "SOLANA",
    derivation: "solanaDerivation",
    kinds: ["ed25519"],
    shared: ["slip10-ed25519"],
  },
  stellar: {
    prefix: "STELLAR",
    derivation: "stellarDerivation",
    kinds: ["ed25519"],
    shared: ["slip10-ed25519", "crc16"],
  },
  near: {
    prefix: "NEAR",
    derivation: "nearDerivation",
    kinds: ["ed25519"],
    shared: ["slip10-ed25519"],
  },
  hedera: {
    prefix: "HEDERA",
    derivation: "hederaDerivation",
    kinds: ["ed25519", "bip44"],
    shared: ["slip10-ed25519", "keccak-account"],
  },
});

export const SINGLE_KEY_COIN_IDS = Object.freeze(Object.keys(SINGLE_KEY_COINS));

/** The id of a coin's startup self-test, such as runBitcoinCashDerivationSelfTest. */
export function singleKeySelfTest(coin) {
  const words = coin.split("-").map((word) => `${word[0].toUpperCase()}${word.slice(1)}`);
  return `run${words.join("")}DerivationSelfTest`;
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

/** The graph markers of a single-key coin's own modules, which no build without it may hold. */
export function singleKeyCoinMarkers(coin) {
  return [
    `/coins/${coin}/`,
    `/adapters/${coin}.ts`,
    `derivation-self-test-${coin}.ts`,
    `/wallet-recovery/src/matcher-targets-${coin}.ts`,
    ...(coin === "bitcoin-cash" ? ["/crypto-core/src/cashaddr.ts"] : []),
  ];
}

/** Whether any of `coins` (ids) is a single-key coin of `kind`, "bip44" or "ed25519". */
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
  any: Object.freeze([
    "/coins/coin-variant.ts",
    "/coins/single-key-path-self-test.ts",
    "/verification/src/single-key-coin-self-test.ts",
    "/wallet-recovery/src/matcher-targets-single-key.ts",
  ]),
});
