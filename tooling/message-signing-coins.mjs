// The Deriver's coins that sign messages, from which a build composes its page policies, its
// worker's signers and their known answers. Each coin's modules sit at the same places, named by
// its id, so that one entry here brings all of them and a build without the coin holds none.

/**
 * coin id → the prefix of its exports and its known-answer checks: `startup` at every start,
 * `full` only in the full self-test (CORE-29).
 */
export const MESSAGE_SIGNING_COINS = Object.freeze({
  bitcoin: {
    prefix: "BITCOIN",
    startup: ["runBitcoinMessageSigningSelfTest"],
    full: ["runBip322FullSelfTest"],
  },
  dash: { prefix: "DASH", startup: ["runDashMessageSigningSelfTest"], full: [] },
  litecoin: {
    prefix: "LITECOIN",
    startup: ["runLitecoinMessageSigningSelfTest"],
    full: ["runLitecoinMessageSigningFullSelfTest"],
  },
  dogecoin: {
    prefix: "DOGECOIN",
    startup: ["runDogecoinMessageSigningSelfTest"],
    full: ["runDogecoinMessageSigningFullSelfTest"],
  },
  "bitcoin-cash": {
    prefix: "BITCOIN_CASH",
    startup: ["runBitcoinCashMessageSigningSelfTest"],
    full: ["runBitcoinCashMessageSigningFullSelfTest"],
  },
  zcash: {
    prefix: "ZCASH",
    startup: ["runZcashMessageSigningSelfTest"],
    full: ["runZcashMessageSigningFullSelfTest"],
  },
  ethereum: {
    prefix: "ETHEREUM",
    startup: ["runEthereumMessageSigningSelfTest"],
    full: ["runEthereumMessageSigningFullSelfTest"],
  },
  "ethereum-classic": {
    prefix: "ETHEREUM_CLASSIC",
    startup: ["runEthereumClassicMessageSigningSelfTest"],
    full: ["runEthereumClassicMessageSigningFullSelfTest"],
  },
  tron: { prefix: "TRON", startup: ["runTronMessageSigningSelfTest"], full: [] },
  solana: {
    prefix: "SOLANA",
    startup: ["runSolanaMessageSigningSelfTest"],
    full: ["runSolanaMessageSigningFullSelfTest"],
  },
  stellar: {
    prefix: "STELLAR",
    startup: ["runStellarMessageSigningSelfTest"],
    full: ["runStellarMessageSigningFullSelfTest"],
  },
  near: {
    prefix: "NEAR",
    startup: ["runNearMessageSigningSelfTest"],
    full: ["runNearMessageSigningFullSelfTest"],
  },
  ton: {
    prefix: "TON",
    startup: ["runTonMessageSigningSelfTest"],
    full: ["runTonMessageSigningFullSelfTest"],
  },
  cosmos: { prefix: "COSMOS", startup: ["runCosmosMessageSigningSelfTest"], full: [] },
  injective: { prefix: "INJECTIVE", startup: ["runInjectiveMessageSigningSelfTest"], full: [] },
  hedera: { prefix: "HEDERA", startup: ["runHederaMessageSigningSelfTest"], full: [] },
});

export const MESSAGE_SIGNING_COIN_IDS = Object.freeze(Object.keys(MESSAGE_SIGNING_COINS));

/** The repository-relative modules and export names of a signing coin. */
export function messageSigningModules(coin) {
  const { prefix } = MESSAGE_SIGNING_COINS[coin];
  return Object.freeze({
    binding: `packages/coin-protocols/src/coins/${coin}/message-signing.ts`,
    bindingSymbol: `${prefix}_MESSAGE_SIGNING`,
    policy: `apps/key-derivation/src/ui/message-signing-policy-${coin}.ts`,
    policySymbol: `${prefix}_MESSAGE_SIGNING_POLICY`,
    selfTest: `apps/key-derivation/src/workers/message-signer-self-test-${coin}.ts`,
  });
}

/** The signing coins of a build whose coins `hasCoin` admits, in the table's order. */
export function messageSigningCoinsOf(hasCoin) {
  return MESSAGE_SIGNING_COIN_IDS.filter((coin) => hasCoin(coin));
}

/** The graph markers of a signing coin's page policy and known answers. */
export function messageSigningCoinMarkers(coin) {
  return [`/message-signing-policy-${coin}.ts`, `/message-signer-self-test-${coin}.ts`];
}

/**
 * The modules of the message-signing feature itself: the page dialog and policies
 * (ui/message-signing-*.ts), the coins' signers (coins/message-signing.ts and
 * coins/<coin>/message-signing.ts), their known answers and Bitcoin's BIP-322 signer.
 */
export const MESSAGE_SIGNING_FEATURE_MARKERS = Object.freeze([
  "/message-signing-",
  "/message-signing.ts",
  "/message-signer-self-test",
  "/crypto-core/src/bip322-signing.ts",
]);
