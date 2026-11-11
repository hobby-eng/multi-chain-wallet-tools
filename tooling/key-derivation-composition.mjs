import { MhfeIntegrationModules } from "./mhfe-integration.mjs";
import {
  COMBINED_SELF_TEST_MODULE,
  DERIVATION_SELF_TESTS,
  LOCAL_SEARCH_SELF_TEST,
} from "./derivation-self-tests.mjs";
import { resolve } from "node:path";
import { COIN_WORDS } from "../packages/recovery-backup/src/mnemocode-offered-coins.ts";
import {
  hasSingleKeyKind,
  needsSharedModule,
  SHARED_MODULES,
  SINGLE_KEY_COINS,
  SINGLE_KEY_COIN_IDS,
  SINGLE_KEY_SHARED_MARKERS,
  singleKeyCoinMarkers,
  singleKeyCoinModules,
} from "./single-key-coins.mjs";
import { TOOL_MANIFESTS } from "./tool-manifests.mjs";

const adapterModules = {
  bitcoin: ["BITCOIN_COIN_ADAPTERS", "packages/coin-protocols/src/coins/adapters/bitcoin.ts"],
  dash: ["DASH_COIN_ADAPTERS", "packages/coin-protocols/src/coins/adapters/dash.ts"],
  ethereum: ["ETHEREUM_COIN_ADAPTERS", "packages/coin-protocols/src/coins/adapters/ethereum.ts"],
  ...Object.fromEntries(
    Object.entries(SINGLE_KEY_COINS).map(([coin, { prefix }]) => [
      coin,
      [`${prefix}_COIN_ADAPTERS`, singleKeyCoinModules(coin).adapters],
    ]),
  ),
};

function selectedRegistrySource(root, features) {
  const { coins } = features;
  const imports = coins.map(
    (coin) =>
      `import { ${adapterModules[coin][0]} } from ${JSON.stringify(resolve(root, adapterModules[coin][1]))};`,
  );
  const spreads = coins.map((coin) => `...${adapterModules[coin][0]}`).join(", ");
  const registry = JSON.stringify(
    resolve(root, "packages/coin-protocols/src/coins/registry-base.ts"),
  );
  const names =
    "COIN_ADAPTERS, COIN_FAMILIES, getAdapterFamilyId, getCoinAdapter, getCoinFamily, getDefaultCoinAdapter";
  // The Dash Community Edition holds Dash alone, and so do the lists it composes from MHFE and
  // MnemoCode: it has no order to keep and names no other coin. Every other build orders its
  // coins, and those lists, by coin-order.ts: Bitcoin first, then alphabetically.
  if (features.dashCommunity === true)
    return `${imports.join("\n")}
import { createCoinRegistry } from ${registry};
/** One coin: nothing to order. */
export function compareCoinNames() { return 0; }
export const { ${names} } = createCoinRegistry([${spreads}]);`;
  const order = JSON.stringify(resolve(root, "packages/coin-protocols/src/coins/coin-order.ts"));
  return `${imports.join("\n")}
import { createCoinRegistry } from ${registry};
import { orderCoins } from ${order};
export { compareCoinNames } from ${order};
export const { ${names} } = createCoinRegistry([${spreads}], (labels) => orderCoins(labels, (label) => label));`;
}

function selectedRuntimeSource(root, coins) {
  const imports = [
    `import * as registry from 'ckd:selected-coin-registry';`,
    `import { resolveCoinProtocol } from ${JSON.stringify(resolve(root, "packages/coin-protocols/src/coins/registry-base.ts"))};`,
  ];
  const dispatch = [];
  if (coins.includes("bitcoin")) {
    imports.push(
      `import { deriveBitcoin } from ${JSON.stringify(resolve(root, "packages/coin-protocols/src/coins/bitcoin/index.ts"))};`,
      `import { BitcoinPurposeProfile } from ${JSON.stringify(resolve(root, "packages/coin-protocols/src/coins/bitcoin/profiles.ts"))};`,
    );
    dispatch.push(`const bitcoin = BitcoinPurposeProfile.forAdapterId(id);
if (bitcoin !== undefined) return { ...metadata, derive: (input) => deriveBitcoin(bitcoin.mode, input) };`);
  }
  if (coins.includes("ethereum")) {
    imports.push(
      `import { deriveEthereum } from ${JSON.stringify(resolve(root, "packages/coin-protocols/src/coins/ethereum/index.ts"))};`,
    );
    dispatch.push(`if (id === 'ethereum') return { ...metadata, derive: deriveEthereum };`);
  }
  if (coins.includes("dash")) {
    imports.push(
      `import { DashRuntimeRegistry } from ${JSON.stringify(resolve(root, "packages/coin-protocols/src/coins/dash/runtime.ts"))};`,
    );
    dispatch.push(`const dash = DashRuntimeRegistry.derivationFor(id);
if (dash !== undefined) return { ...metadata, derive: dash };`);
  }
  // Each single-key coin's derivation answers only its own adapter ids.
  for (const coin of coins.filter((selected) => Object.hasOwn(SINGLE_KEY_COINS, selected))) {
    const { derivation } = SINGLE_KEY_COINS[coin];
    imports.push(
      `import { ${derivation} } from ${JSON.stringify(resolve(root, singleKeyCoinModules(coin).derivation))};`,
    );
    dispatch.push(`{ const derive = ${derivation}(id);
if (derive !== undefined) return { ...metadata, derive }; }`);
  }
  return `${imports.join("\n")}
export function getRuntimeCoinAdapter(id) {
  const metadata = resolveCoinProtocol(registry, id) ?? registry.getCoinAdapter(id);
  ${dispatch.join("\n")}
  throw new Error('Unsupported derivation protocol in this build: ' + id + '.');
}`;
}

function selectedSelfTestSource(root, coins) {
  if (coins.length === DERIVER_COINS.length) {
    return `export { runDerivationSelfTest } from ${JSON.stringify(resolve(root, "packages/verification/src/derivation-self-test.ts"))};`;
  }
  if (coins.length === 1 && coins[0] === "dash") {
    return `export { runDashDerivationSelfTest as runDerivationSelfTest } from ${JSON.stringify(resolve(root, "packages/verification/src/derivation-self-test-dash.ts"))};`;
  }
  const imports = coins.map(
    (coin) =>
      `import { ${DERIVATION_SELF_TESTS[coin][0]} } from ${JSON.stringify(resolve(root, DERIVATION_SELF_TESTS[coin][1]))};`,
  );
  return `${imports.join("\n")}
import { combinedSelfTest } from ${JSON.stringify(resolve(root, COMBINED_SELF_TEST_MODULE))};
export function runDerivationSelfTest() {
  return combinedSelfTest([${coins.map((coin) => DERIVATION_SELF_TESTS[coin][0]).join(", ")}]);
}`;
}

/** coin → [its Wallet Matcher part, module from the repository root]. */
const MATCHER_COINS = {
  bitcoin: ["BITCOIN_MATCHER", "packages/wallet-recovery/src/address-targets.ts"],
  dash: ["DASH_MATCHER", "packages/wallet-recovery/src/matcher-targets-dash.ts"],
  ethereum: ["ETHEREUM_MATCHER", "packages/wallet-recovery/src/matcher-targets-ethereum.ts"],
  ...Object.fromEntries(
    Object.entries(SINGLE_KEY_COINS).map(([coin, { prefix }]) => [
      coin,
      [`${prefix}_MATCHER`, singleKeyCoinModules(coin).matcher],
    ]),
  ),
};

function selectedMatcherSource(root, features) {
  if (!features.has("wallet-matcher")) {
    return `export function detectSelectedMatcherTargets() { throw new Error('Wallet Matcher is not included in this build.'); }`;
  }
  const { coins } = features;
  // Each coin brings its recognizer and its address profiles (packages/wallet-recovery).
  const imports = coins.map(
    (coin) =>
      `import { ${MATCHER_COINS[coin][0]} } from ${JSON.stringify(resolve(root, MATCHER_COINS[coin][1]))};`,
  );
  return `${imports.join("\n")}
import { detectMatcherTargets } from ${JSON.stringify(resolve(root, "packages/wallet-recovery/src/matcher-targets.ts"))};
const COINS = [${coins.map((coin) => MATCHER_COINS[coin][0]).join(", ")}];
export function detectSelectedMatcherTargets(input, network, forceAllProfiles) {
  return detectMatcherTargets(input, network, forceAllProfiles, COINS);
}`;
}

function selectedRecoverySelfTestSource(root, features) {
  const definitions = [
    ["seedqr", "runSeedQrSelfTest", "self-test-seedqr.ts"],
    // The decoy texts of a SeedQR hidden in a decoy QR, which needs MnemoCode's hidden QR.
    ["seedqr+mnemocode", "runDecoyQrTextSelfTest", "self-test-decoy-qr-text.ts"],
    ["mnemocode", "runMnemoCodeSelfTest", "self-test-mnemocode.ts"],
    ["mnemocode-cards", "runMnemoCodeCardsSelfTest", "self-test-mnemocode-cards.ts"],
    ["slip39", "runSlip39SelfTest", "self-test-slip39.ts"],
    ["codex32", "runCodex32SelfTest", "self-test-codex32.ts"],
    ["sskr", "runSskrSelfTest", "self-test-sskr.ts"],
    ["gordian-envelope", "runGordianEnvelopeSelfTest", "self-test-gordian-envelope.ts"],
  ].filter(([needed]) => needed.split("+").every((feature) => features.has(feature)));
  const imports = definitions.map(
    ([, symbol, file]) =>
      `import { ${symbol} } from ${JSON.stringify(resolve(root, "packages/recovery-backup/src", file))};`,
  );
  const calls = definitions.map(([, symbol]) => `${symbol}()`).join(", ");
  // MnemoCode's checks load its WebAssembly first, so the run is asynchronous.
  return `${imports.join("\n")}
import { combinedReports } from ${JSON.stringify(resolve(root, COMBINED_SELF_TEST_MODULE))};
export async function runRecoveryBackupSelfTest() {
  return combinedReports(await Promise.all([${calls}]));
}`;
}

/** The Deriver's coins: a build with all of them offers every coin of MnemoCode's. */
const DERIVER_COINS = TOOL_MANIFESTS["key-derivation"].coins;

/**
 * The coins of MnemoCode whose addresses a build with only some of the Deriver's coins compares:
 * those of its own coins that MnemoCode knows (COIN_WORDS); a coin MnemoCode does not know, such as
 * Solana, is never offered to it. The full build offers all of MnemoCode's coins (the owner's
 * choice of 2026-10-07; packages/recovery-backup/src/mnemocode-offered-coins.ts). MnemoCode's file
 * of the page still holds them: it is one file per page (MnemoCode ADR 0007), and the page narrows
 * an address to its own coins. Only the offered coins' names come with the list, so that the Dash
 * Community Edition names no other coin.
 */
function selectedMnemoCodeCoinsSource(features) {
  const coins = DERIVER_COINS.filter(
    (coin) => features.hasCoin(coin) && Object.hasOwn(COIN_WORDS, coin),
  );
  const words = Object.fromEntries(coins.map((coin) => [coin, COIN_WORDS[coin]]));
  return [
    `export const OFFERED_COIN_IDS = ${JSON.stringify(coins)};`,
    `export const COIN_WORDS = Object.freeze(${JSON.stringify(words)});`,
  ].join("\n");
}

export function createKeyDerivationCompositionPlugin(root, features) {
  const fullCoins = DERIVER_COINS.every((coin) => features.hasCoin(coin));
  const modules = new Map([
    ["ckd:selected-coin-registry", selectedRegistrySource(root, features)],
    ["ckd:selected-runtime-registry", selectedRuntimeSource(root, features.coins)],
    ["ckd:selected-derivation-self-test", selectedSelfTestSource(root, features.coins)],
    ["ckd:selected-matcher-targets", selectedMatcherSource(root, features)],
    ["ckd:selected-recovery-self-test", selectedRecoverySelfTestSource(root, features)],
    ["ckd:selected-mnemocode-coins", selectedMnemoCodeCoinsSource(features)],
  ]);
  return {
    name: "key-derivation-composition",
    setup(build) {
      build.onResolve({ filter: /^ckd:selected-/ }, ({ path }) => ({
        path,
        namespace: "ckd-selection",
      }));
      build.onResolve({ filter: /^@ckd\/coins\/(?:registry|dash-registry)\.js$/ }, () => ({
        path: "ckd:selected-coin-registry",
        namespace: "ckd-selection",
      }));
      build.onResolve(
        { filter: /^@ckd\/recovery\/matcher-targets-(?:multichain|dash)\.js$/ },
        () => ({
          path: "ckd:selected-matcher-targets",
          namespace: "ckd-selection",
        }),
      );
      // The offered coins: all of MnemoCode's in the full build, otherwise the build's own.
      if (!fullCoins)
        build.onResolve({ filter: /^\.\/mnemocode-offered-coins\.js$/ }, () => ({
          path: "ckd:selected-mnemocode-coins",
          namespace: "ckd-selection",
        }));
      build.onResolve({ filter: /^@ckd\/recovery-backup\/self-test\.js$/ }, () => ({
        path: "ckd:selected-recovery-self-test",
        namespace: "ckd-selection",
      }));
      build.onLoad({ filter: /.*/, namespace: "ckd-selection" }, ({ path }) => ({
        contents: modules.get(path),
        loader: "ts",
        resolveDir: root,
      }));
    },
  };
}

export function selectedWorkerEntry(root, profile, features) {
  const imports = [
    `import { getRuntimeCoinAdapter } from 'ckd:selected-runtime-registry';`,
    `import { runDerivationSelfTest } from 'ckd:selected-derivation-self-test';`,
    `import { startDerivationWorker } from ${JSON.stringify(resolve(root, "apps/key-derivation/src/workers/worker-runtime.ts"))};`,
  ];
  const properties = ["getRuntimeCoinAdapter", "runDerivationSelfTest"];
  const optional = [
    ["silent-payments", "deriveSilentPayment", "silent-payment.ts"],
    [
      "bip38-encrypt",
      "encryptDerivedP2pkhKey",
      features.hasCoin("bitcoin") ? "bip38-encrypter.ts" : "bip38-encrypter-dash.ts",
    ],
    [
      "message-signing",
      "signDerivedMessage",
      features.hasCoin("bitcoin") ? "message-signer.ts" : "message-signer-dash.ts",
    ],
    [
      "multisig",
      "deriveMultisigWallet",
      // Each coin's schemes come only with the coin.
      features.hasCoin("bitcoin")
        ? features.hasCoin("dash")
          ? "multisig-wallet.ts"
          : "multisig-wallet-bitcoin.ts"
        : "multisig-wallet-dash.ts",
    ],
  ];
  if (features.has("bip85")) {
    imports.push(
      `import { Bip85 } from ${JSON.stringify(resolve(root, "packages/crypto-core/src/bip85.ts"))};`,
    );
    properties.push("deriveBip85: Bip85.derive");
  }
  for (const [feature, symbol, file] of optional) {
    if (!features.has(feature)) continue;
    imports.push(
      `import { ${symbol} } from ${JSON.stringify(resolve(root, "apps/key-derivation/src/workers", file))};`,
    );
    properties.push(symbol);
  }
  // Each feature's known answers come with it: the quick ones run at every startup, the slower
  // ones (scrypt, the BIP-322 library) only in the full self-test. A coin's vectors come with the
  // coin, so that a build carries none of another coin's (AUD-023-BLD001).
  const selfTests = [
    ["silent-payments", null, "startup", "runSilentPaymentSelfTest", "silent-payment-self-test.ts"],
    ["bip85", null, "startup", "runBip85SelfTest", "bip85-self-test.ts"],
    [
      "message-signing",
      "bitcoin",
      "startup",
      "runBitcoinMessageSigningSelfTest",
      "message-signer-self-test-bitcoin.ts",
    ],
    [
      "message-signing",
      "dash",
      "startup",
      "runDashMessageSigningSelfTest",
      "message-signer-self-test-dash.ts",
    ],
    [
      "message-signing",
      "bitcoin",
      "full",
      "runBip322FullSelfTest",
      "message-signer-self-test-bitcoin.ts",
    ],
    [
      "bip38-encrypt",
      "bitcoin",
      "full",
      "runBitcoinBip38FullSelfTest",
      "bip38-self-test-bitcoin.ts",
    ],
    ["bip38-encrypt", "dash", "full", "runDashBip38FullSelfTest", "bip38-self-test-dash.ts"],
    // A coin's own protocols carry no feature name; they come and go with the coin.
    [null, "dash", "full", "runDashMasternodeFullSelfTest", "masternode-self-test-dash.ts"],
    [null, "ton", "full", "runTonKeyFullSelfTest", "ton-key-self-test.ts"],
  ].filter(
    ([feature, coin]) =>
      (feature === null || features.has(feature)) && (coin === null || features.hasCoin(coin)),
  );
  for (const [, , , symbol, file] of selfTests)
    imports.push(
      `import { ${symbol} } from ${JSON.stringify(resolve(root, "apps/key-derivation/src/workers", file))};`,
    );
  const listed = (stage) =>
    selfTests.filter(([, , when]) => when === stage).map(([, , , symbol]) => symbol);
  const startup = listed("startup");
  if (features.has("wallet-matcher")) {
    imports.push(
      `import { ${LOCAL_SEARCH_SELF_TEST.symbol} } from ${JSON.stringify(resolve(root, LOCAL_SEARCH_SELF_TEST.module))};`,
    );
    startup.unshift(LOCAL_SEARCH_SELF_TEST.symbol);
  }
  properties.push(
    `startupSelfTests: [${startup.join(", ")}]`,
    `fullSelfTests: [${listed("full").join(", ")}]`,
  );
  return `${imports.join("\n")}\nstartDerivationWorker({ ${properties.join(", ")} });`;
}

export function selectedUiEntry(root) {
  return `import * as registry from 'ckd:selected-coin-registry';
import { detectSelectedMatcherTargets } from 'ckd:selected-matcher-targets';
import { startKeyDerivationApp } from ${JSON.stringify(resolve(root, "apps/key-derivation/src/ui/app-bootstrap.ts"))};
startKeyDerivationApp(registry, detectSelectedMatcherTargets);`;
}

const coinSourceMarkers = {
  bitcoin: [
    "/coins/bitcoin/",
    "/adapters/bitcoin.ts",
    "derivation-self-test-bitcoin.ts",
    // A coin's self-test vectors come only with the coin (AUD-023-BLD001).
    "/message-signer-self-test-bitcoin.ts",
    "/bip38-self-test-bitcoin.ts",
    "btcutil-js",
    "/wallet-recovery/src/address-targets.ts",
  ],
  dash: [
    "/coins/dash/",
    "/adapters/dash.ts",
    "derivation-self-test-dash.ts",
    "/message-signer-self-test-dash.ts",
    "/bip38-self-test-dash.ts",
    "/masternode-self-test-dash.ts",
    "dash-shielded-wasm",
    "/wallet-recovery/src/matcher-targets-dash.ts",
  ],
  ethereum: [
    "/coins/ethereum/",
    "/adapters/ethereum.ts",
    "derivation-self-test-ethereum.ts",
    "/wallet-recovery/src/matcher-targets-ethereum.ts",
  ],
  ...Object.fromEntries(SINGLE_KEY_COIN_IDS.map((coin) => [coin, singleKeyCoinMarkers(coin)])),
};

const featureSourceMarkers = {
  bip85: [
    "/bip85-feature.ts",
    "/bip85-child-wallet-feature.ts",
    "/bip85-child-derivation.ts",
    "/coin-protocols/src/coins/embedded-derivation.ts",
    "/crypto-core/src/bip85.ts",
    "/bip85-self-test.ts",
  ],
  "silent-payments": [
    "/silent-payment-feature.ts",
    "/silent-payment.ts",
    "/silent-payment-self-test.ts",
    "/coin-protocols/src/coins/bitcoin/silent-payments.ts",
    "/coin-protocols/src/coins/bitcoin/silent-payment-parameters.ts",
  ],
  "bip38-encrypt": [
    "/bip38-encryption-feature.ts",
    "/bip38-encrypter.ts",
    "/bip38-encrypter-dash.ts",
    "/bip38-self-test.ts",
    "/bip38-self-test-bitcoin.ts",
    "/bip38-self-test-dash.ts",
  ],
  "message-signing": [
    "/crypto-core/src/bip322-signing.ts",
    "/bip322-signer.ts",
    "/message-signing-feature.ts",
    "/message-signer.ts",
    "/message-signer-dash.ts",
    "/message-signer-self-test.ts",
    "/message-signer-self-test-bitcoin.ts",
    "/message-signer-self-test-dash.ts",
  ],
  "wallet-matcher": [
    "/recovery-wallet-matcher.ts",
    "apps/key-derivation/src/ui/matcher-results.ts",
    "/wallet-recovery/src/matcher-plan.ts",
    "/wallet-recovery/src/matcher-scope.ts",
    "/wallet-recovery/src/matcher-secrets.ts",
    ...LOCAL_SEARCH_SELF_TEST.sourceMarkers,
  ],
  multisig: [
    "/recovery-multisig.ts",
    "apps/key-derivation/src/workers/multisig-wallet.ts",
    "apps/key-derivation/src/workers/multisig-wallet-dash.ts",
    "apps/key-derivation/src/workers/multisig-wallet-bitcoin.ts",
    "/coin-protocols/src/coins/multisig-wallet.ts",
    "/coins/dash/multisig-wallet.ts",
    "/coins/bitcoin/multisig-wallet.ts",
  ],
  seedqr: ["/recovery-seedqr.ts", "/recovery-backup/src/seedqr.ts", "/self-test-seedqr.ts"],
  mnemocode: [
    "/recovery-mnemocode.ts",
    "/recovery-mnemocode-help.ts",
    "/recovery-mnemocode-encode.ts",
    "/recovery-mnemocode-disclosure.ts",
    "/recovery-backup/src/mnemocode-disclosure.ts",
    "/recovery-mnemocode-decode.ts",
    "/recovery-mnemocode-reencode.ts",
    "/recovery-mnemocode-forgotten.ts",
    "/recovery-mnemocode-forgotten-dates.ts",
    "/recovery-mnemocode-candidates.ts",
    "/recovery-mnemocode-evidence.ts",
    "/recovery-mnemocode-list.ts",
    "/recovery-mnemocode-fields.ts",
    "/recovery-mnemocode-download.ts",
    "/recovery-mnemocode-results.ts",
    "/recovery-mnemocode-backup-check.ts",
    "/recovery-mnemocode-word-table.ts",
    "/recovery-mnemocode-share-choice.ts",
    "/recovery-mnemocode-self-test.ts",
    "/recovery-mnemocode-share-store.ts",
    "/recovery-backup/src/mnemocode-self-test.ts",
    "/recovery-backup/src/mnemocode-word-table.ts",
    "/recovery-backup/src/mnemocode-search.ts",
    "/recovery-backup/src/mnemocode-marked-codes.ts",
    "/recovery-backup/src/mnemocode-engine.ts",
    "/recovery-backup/src/mnemocode-module.ts",
    "/recovery-backup/src/mnemocode-facts.ts",
    "/recovery-backup/src/mnemocode-wallet.ts",
    "/recovery-backup/src/mnemocode-reencoding.ts",
    "/recovery-backup/src/mnemocode-backup-check.ts",
    "/recovery-mnemocode-stitch.ts",
    "/recovery-mnemocode-stitch-pdf.ts",
    "/recovery-backup/src/mnemocode-stitch.ts",
    "/recovery-mnemocode-section-run.ts",
    // Photo or MP3: MnemoCode's steganography, and its QR codes with a hidden record.
    "/recovery-mnemocode-stego.ts",
    "/recovery-mnemocode-stego-hide.ts",
    "/recovery-mnemocode-stego-open.ts",
    "/recovery-mnemocode-stego-files.ts",
    "/recovery-backup/src/mnemocode-stego.ts",
    "/recovery-backup/src/mnemocode-stego-words.ts",
    "/recovery-backup/src/mnemocode-hidden-qr.ts",
    "/mnemocode-search-worker.ts",
    "/mnemocode-worker-client.ts",
    "/recovery-backup/src/mnemocode.ts",
    "/recovery-mnemocode-wasm/",
    "/self-test-mnemocode.ts",
  ],
  "mnemocode-cards": [
    "/recovery-mnemocode-cards.ts",
    "/recovery-mnemocode-heirs.ts",
    "/recovery-mnemocode-heir-route.ts",
    "/recovery-backup/src/mnemocode-heirs.ts",
    "/recovery-backup/src/mnemocode-cards.ts",
    "/self-test-mnemocode-cards.ts",
  ],
  // One prefix covers every MHFE panel module and the browser package.
  mhfe: MhfeIntegrationModules.markers,
  slip39: [
    "/recovery-slip39.ts",
    "/recovery-slip39-create.ts",
    "/recovery-slip39-restore.ts",
    "/slip39-worker.ts",
    "/slip39-worker-runtime.ts",
    "/page-slip39-wordlist.ts",
    "/recovery-backup/src/slip39-restore-request.ts",
    "/recovery-backup/src/slip39-passphrase.ts",
    "/recovery-backup/src/slip39.ts",
    "/slip39-wordlist.ts",
    "/self-test-slip39.ts",
  ],
  sskr: [
    "/recovery-sskr.ts",
    "/recovery-backup/src/sskr.ts",
    "/recovery-backup/src/sskr-codec.ts",
    "/recovery-sskr-wasm/",
    "/self-test-sskr.ts",
  ],
  "gordian-envelope": [
    "/recovery-gordian-envelope.ts",
    "/recovery-backup/src/gordian-envelope.ts",
    "/recovery-envelope-wasm/",
    "/self-test-gordian-envelope.ts",
  ],
  codex32: [
    "/recovery-codex32.ts",
    "/recovery-backup/src/codex32.ts",
    "/recovery-codex32-wasm/",
    "/self-test-codex32.ts",
  ],
};

/** The SeedQR tab's hidden form and its library, which only seedqr with mnemocode builds. */
const HIDDEN_SEEDQR_MARKERS = [
  "/recovery-seedqr-hidden.ts",
  "/recovery-seedqr-decoy-fields.ts",
  "/recovery-backup/src/hidden-seedqr.ts",
  "/recovery-backup/src/hidden-seedqr-self-test.ts",
  "/recovery-backup/src/decoy-qr-text.ts",
  "/recovery-backup/src/self-test-decoy-qr-text.ts",
];

/** Sources that a pair of features needs: absent unless both are built. */
const sharedSourceMarkers = [
  {
    label: "BIP44-coin derivation (a BIP44 coin)",
    needed: (features) => hasSingleKeyKind(features.hasCoin, "bip44"),
    markers: [...SINGLE_KEY_SHARED_MARKERS.bip44],
  },
  {
    label: "Ed25519-coin derivation (an Ed25519 coin)",
    needed: (features) => hasSingleKeyKind(features.hasCoin, "ed25519"),
    markers: [...SINGLE_KEY_SHARED_MARKERS.ed25519],
  },
  {
    label: "Single-key coin self-test and matcher (a single-key coin)",
    needed: (features) => SINGLE_KEY_COIN_IDS.some((coin) => features.hasCoin(coin)),
    markers: [...SINGLE_KEY_SHARED_MARKERS.any],
  },
  // The modules a few coins share, needed exactly by the coins that import them.
  ...Object.entries(SHARED_MODULES).map(([name, { marker }]) => ({
    label: `Shared module ${name}`,
    needed: (features) => needsSharedModule(features.hasCoin, name),
    markers: [marker],
  })),
  {
    // The Deriver's own draw of phrases that pass the MHFE wallet check, on workers of its own.
    label: "MHFE wallet-check draw (mhfe)",
    needed: (features) => features.has("mhfe"),
    markers: ["/wallet-check-draw", "/crypto-core/src/bip39-wallet-check.ts"],
  },
  {
    // The page's BIP39 list in a worker, which MnemoCode's and the wallet-check draw's are given.
    label: "Page wordlist in workers (mnemocode or mhfe)",
    needed: (features) => features.has("mnemocode") || features.has("mhfe"),
    markers: ["/workers/page-wordlist.ts"],
  },
  {
    label: "MnemoCode shares (mnemocode with sskr)",
    needed: (features) => features.has("mnemocode") && features.has("sskr"),
    markers: ["/recovery-mnemocode-shares.ts", "/recovery-mnemocode-repair-times.ts"],
  },
  {
    // A Standard SeedQR kept as the hidden record of MnemoCode's hidden QR behind a decoy.
    label: "Hidden SeedQR (seedqr with mnemocode)",
    needed: (features) => features.has("seedqr") && features.has("mnemocode"),
    markers: HIDDEN_SEEDQR_MARKERS,
  },
];

const QR_IMAGE_IMPORT_SOURCE = "packages/shared-ui/src/qr-image-import.ts";
const PNG_ADMISSION_SOURCE = "packages/shared-ui/src/png-admission.ts";

function matchesInput(path, source) {
  return path === source || path.endsWith(`/${source}`);
}

/** Fails the build if an excluded coin or feature still reaches either bundle graph. */
export function assertKeyDerivationComposition(features, inputPaths) {
  const normalized = inputPaths.map((path) => path.replaceAll("\\", "/"));
  const includesSource = (source) => normalized.some((path) => matchesInput(path, source));
  const qrImageImport = includesSource(QR_IMAGE_IMPORT_SOURCE);
  const assertAbsent = (label, markers) => {
    const leaked = normalized.filter((path) => markers.some((marker) => path.includes(marker)));
    if (leaked.length > 0)
      throw new Error(
        `${label} is excluded but remains in the bundle graph:\n${leaked.join("\n")}`,
      );
  };
  for (const [coin, markers] of Object.entries(coinSourceMarkers)) {
    if (!features.hasCoin(coin)) assertAbsent(`Coin module ${coin}`, markers);
  }
  for (const [feature, markers] of Object.entries(featureSourceMarkers)) {
    if (!features.has(feature)) assertAbsent(`Feature ${feature}`, markers);
  }
  for (const { label, needed, markers } of sharedSourceMarkers) {
    if (!needed(features)) assertAbsent(label, markers);
  }
  if (qrImageImport && !includesSource(PNG_ADMISSION_SOURCE))
    throw new Error(`QR image import requires ${PNG_ADMISSION_SOURCE} in the bundle graph.`);
  const requireInput = (label, marker) => {
    if (!normalized.some((path) => path.includes(marker))) {
      throw new Error(`${label} is selected but ${marker} is absent from the bundle graph.`);
    }
  };
  if (features.has("bip85")) {
    for (const marker of [
      "/bip85-feature.ts",
      "/bip85-child-wallet-feature.ts",
      "/bip85-child-derivation.ts",
      "/crypto-core/src/bip85.ts",
    ])
      requireInput("Feature bip85", marker);
  }
  if (features.has("silent-payments")) {
    requireInput("Feature silent-payments", "/silent-payment-feature.ts");
    requireInput("Feature silent-payments", "/silent-payment.ts");
    requireInput("Feature silent-payments", "/coin-protocols/src/coins/bitcoin/silent-payments.ts");
    requireInput(
      "Feature silent-payments",
      "/coin-protocols/src/coins/bitcoin/silent-payment-parameters.ts",
    );
  }
  if (features.has("bip38-encrypt"))
    requireInput("Feature bip38-encrypt", "/bip38-encryption-feature.ts");
  if (features.has("message-signing"))
    requireInput("Feature message-signing", "/message-signing-feature.ts");
  if (features.has("wallet-matcher"))
    for (const marker of LOCAL_SEARCH_SELF_TEST.sourceMarkers)
      requireInput("Wallet Matcher startup self-test", marker);
  if (features.has("mnemocode") && features.has("sskr"))
    requireInput("MnemoCode shares (mnemocode with sskr)", "/recovery-mnemocode-shares.ts");
  if (features.has("seedqr") && features.has("mnemocode"))
    for (const marker of HIDDEN_SEEDQR_MARKERS)
      requireInput("Hidden SeedQR (seedqr with mnemocode)", marker);
}
