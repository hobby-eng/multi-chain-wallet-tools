import { MhfeIntegrationModules } from "./mhfe-integration.mjs";
import {
  COMBINED_SELF_TEST_MODULE,
  DERIVATION_SELF_TESTS,
  LOCAL_SEARCH_SELF_TEST,
} from "./derivation-self-tests.mjs";
import { resolve } from "node:path";

const adapterModules = {
  bitcoin: ["BITCOIN_COIN_ADAPTERS", "packages/coin-protocols/src/coins/adapters/bitcoin.ts"],
  dash: ["DASH_COIN_ADAPTERS", "packages/coin-protocols/src/coins/adapters/dash.ts"],
  ethereum: ["ETHEREUM_COIN_ADAPTERS", "packages/coin-protocols/src/coins/adapters/ethereum.ts"],
};

function selectedRegistrySource(root, coins) {
  const imports = coins.map(
    (coin) =>
      `import { ${adapterModules[coin][0]} } from ${JSON.stringify(resolve(root, adapterModules[coin][1]))};`,
  );
  const spreads = coins.map((coin) => `...${adapterModules[coin][0]}`).join(", ");
  return `${imports.join("\n")}
import { createCoinRegistry } from ${JSON.stringify(resolve(root, "packages/coin-protocols/src/coins/registry-base.ts"))};
export const { COIN_ADAPTERS, COIN_FAMILIES, getAdapterFamilyId, getCoinAdapter, getCoinFamily, getDefaultCoinAdapter } = createCoinRegistry([${spreads}]);`;
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
  return `${imports.join("\n")}
export function getRuntimeCoinAdapter(id) {
  const metadata = resolveCoinProtocol(registry, id) ?? registry.getCoinAdapter(id);
  ${dispatch.join("\n")}
  throw new Error('Unsupported derivation protocol in this build: ' + id + '.');
}`;
}

function selectedSelfTestSource(root, coins) {
  if (coins.length === 3) {
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
    ["mnemocode", "runMnemoCodeSelfTest", "self-test-mnemocode.ts"],
    ["mnemocode-cards", "runMnemoCodeCardsSelfTest", "self-test-mnemocode-cards.ts"],
    ["mnemocode-cards", "runMnemoCodeHeirsSelfTest", "self-test-mnemocode-heirs.ts"],
    // Share cards need the card export and the SSKR library both.
    [
      "mnemocode-cards+sskr",
      "runMnemoCodeShareCardsSelfTest",
      "self-test-mnemocode-share-cards.ts",
    ],
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
  return `${imports.join("\n")}
import { combinedReports } from ${JSON.stringify(resolve(root, COMBINED_SELF_TEST_MODULE))};
export function runRecoveryBackupSelfTest() {
  return combinedReports([${calls}]);
}`;
}

/** The Deriver's coins: a build with all of them offers every coin of MnemoCode's. */
const DERIVER_COINS = ["bitcoin", "dash", "ethereum"];

/**
 * The coins of MnemoCode that a build with only some of the Deriver's coins offers as "an address of
 * another coin", with their known answers: Dash and Ethereum where built. Bitcoin has wallet
 * evidence of its own; MnemoCode's other nine coins come only with the full build (the owner's
 * choice of 2026-10-07; packages/recovery-backup/src/mnemocode-offered-coins.ts).
 */
function selectedMnemoCodeCoinsSource(root, features) {
  const families = [
    ["dash", "DASH", "dash.ts", "DASH_ADDRESS_SELF_TEST", "dash-self-test.ts"],
    ["ethereum", "ETHEREUM", "ethereum.ts", "ETHEREUM_ADDRESS_SELF_TEST", "ethereum-self-test.ts"],
  ].filter(([coin]) => features.hasCoin(coin));
  const coins = resolve(root, "packages/recovery-mnemocode/source/core/coins");
  const imports = families.flatMap(([, coin, file, check, checkFile]) => [
    `import { ${coin} } from ${JSON.stringify(resolve(coins, file))};`,
    `import { ${check} } from ${JSON.stringify(resolve(coins, checkFile))};`,
  ]);
  return `${imports.join("\n")}
export const OFFERED_COINS = [${families.map(([, coin]) => coin).join(", ")}];
export const OFFERED_COIN_CHECKS = [${families.map(([, , , check]) => check).join(", ")}];`;
}

export function createKeyDerivationCompositionPlugin(root, features) {
  const fullCoins = DERIVER_COINS.every((coin) => features.hasCoin(coin));
  const modules = new Map([
    ["ckd:selected-coin-registry", selectedRegistrySource(root, features.coins)],
    ["ckd:selected-runtime-registry", selectedRuntimeSource(root, features.coins)],
    ["ckd:selected-derivation-self-test", selectedSelfTestSource(root, features.coins)],
    ["ckd:selected-matcher-targets", selectedMatcherSource(root, features)],
    ["ckd:selected-recovery-self-test", selectedRecoverySelfTestSource(root, features)],
    ["ckd:selected-mnemocode-coins", selectedMnemoCodeCoinsSource(root, features)],
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
      // MnemoCode's wallet recognition: every kind of evidence where Bitcoin is built, otherwise the
      // master fingerprint and the addresses of the offered coins
      // (packages/recovery-backup/src/mnemocode-wallet.ts).
      if (!features.hasCoin("bitcoin"))
        build.onResolve(
          { filter: /^@ckd\/recovery-backup\/mnemocode-wallet-bitcoin\.js$/ },
          () => ({
            path: resolve(root, "packages/recovery-backup/src/mnemocode-wallet-coins.ts"),
          }),
        );
      // The offered coins: all of MnemoCode's in the full build, otherwise the build's own.
      if (!fullCoins)
        build.onResolve({ filter: /^\.\/mnemocode-offered-coins\.js$/ }, () => ({
          path: "ckd:selected-mnemocode-coins",
          namespace: "ckd-selection",
        }));
      // Share cards, their renderer and their checks come only with the SSKR library
      // (mnemocode-share-card-checks.ts, mnemocode-share-render.ts).
      if (!features.has("sskr")) {
        build.onResolve(
          { filter: /^@ckd\/recovery-backup\/mnemocode-share-card-checks\.js$/ },
          () => ({
            path: resolve(root, "packages/recovery-backup/src/mnemocode-share-card-checks-none.ts"),
          }),
        );
        build.onResolve({ filter: /^\.\/mnemocode-share-render\.js$/ }, () => ({
          path: resolve(root, "packages/recovery-backup/src/mnemocode-share-render-none.ts"),
        }));
      }
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
    ["bip85", "deriveBip85", "bip85-deriver.ts"],
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
  ];
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
  ].filter(([feature, coin]) => features.has(feature) && (coin === null || features.hasCoin(coin)));
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
    "/recovery-backup/src/mnemocode-wallet-bitcoin.ts",
    "/recovery-mnemocode/source/core/wallet-evidence.ts",
    "/recovery-mnemocode/source/core/wallet-evidence-self-test.ts",
    // MnemoCode's wallet evidence names every coin family (core/coins.ts), so their code comes
    // with Bitcoin's recognition; their checks come only with the full build (see below).
    "/recovery-mnemocode/source/core/coins.ts",
    "/recovery-mnemocode/source/core/coins/bitcoin-like.ts",
    "/recovery-mnemocode/source/core/coins/bitcoin-cash.ts",
    "/recovery-mnemocode/source/core/coins/cosmos.ts",
    "/recovery-mnemocode/source/core/coins/xrp.ts",
    "/recovery-mnemocode/source/core/coins/taproot.ts",
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
    "dash-shielded-wasm",
    "/wallet-recovery/src/matcher-targets-dash.ts",
  ],
  ethereum: [
    "/coins/ethereum/",
    "/adapters/ethereum.ts",
    "derivation-self-test-ethereum.ts",
    "/wallet-recovery/src/matcher-targets-ethereum.ts",
  ],
};

const featureSourceMarkers = {
  bip85: [
    "/bip85-feature.ts",
    "/bip85-child-wallet-feature.ts",
    "/bip85-deriver.ts",
    "/bip85-self-test.ts",
  ],
  "silent-payments": [
    "/silent-payment-feature.ts",
    "/silent-payment.ts",
    "/silent-payment-self-test.ts",
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
    "/message-signing-feature.ts",
    "/message-signer.ts",
    "/message-signer-dash.ts",
    "/message-signer-self-test.ts",
    "/message-signer-self-test-bitcoin.ts",
    "/message-signer-self-test-dash.ts",
  ],
  "wallet-matcher": ["/recovery-wallet-matcher.ts", ...LOCAL_SEARCH_SELF_TEST.sourceMarkers],
  seedqr: ["/recovery-seedqr.ts", "/recovery-backup/src/seedqr.ts", "/self-test-seedqr.ts"],
  mnemocode: [
    "/recovery-mnemocode.ts",
    "/recovery-mnemocode-help.ts",
    "/recovery-mnemocode-encode.ts",
    "/recovery-mnemocode-decode.ts",
    "/recovery-mnemocode-reencode.ts",
    "/recovery-mnemocode-forgotten.ts",
    "/recovery-mnemocode-forgotten-dates.ts",
    "/recovery-mnemocode-candidates.ts",
    "/recovery-mnemocode-evidence.ts",
    "/recovery-mnemocode-list.ts",
    "/recovery-mnemocode-fields.ts",
    "/recovery-mnemocode-results.ts",
    "/recovery-mnemocode-backup-check.ts",
    "/recovery-mnemocode-word-table.ts",
    "/recovery-mnemocode-share-choice.ts",
    "/recovery-mnemocode-self-test.ts",
    "/recovery-mnemocode-share-store.ts",
    "/recovery-backup/src/mnemocode-self-test.ts",
    "/recovery-backup/src/mnemocode-word-table.ts",
    "/recovery-backup/src/mnemocode-search.ts",
    "/mnemocode-search-worker.ts",
    "/mnemocode-worker-client.ts",
    "/recovery-backup/src/mnemocode.ts",
    "/recovery-mnemocode/source/",
    "/self-test-mnemocode.ts",
  ],
  "mnemocode-cards": [
    "/recovery-mnemocode-cards.ts",
    "/recovery-mnemocode-heirs.ts",
    "/recovery-mnemocode-heir-route.ts",
    "/recovery-backup/src/mnemocode-heirs.ts",
    "/recovery-mnemocode-card-images.ts",
    "/recovery-backup/src/mnemocode-cards.ts",
    "/recovery-backup/src/mnemocode-card-assets.ts",
    "/recovery-mnemocode/source/cards.ts",
    "/self-test-mnemocode-share-cards.ts",
    "/self-test-mnemocode-cards.ts",
    "/self-test-mnemocode-heirs.ts",
    "/mnemocode-share-card-checks",
    "/recovery-mnemocode/source/export/",
    "/recovery-mnemocode/source/assets/",
    "/node_modules/pdf-lib/",
    "/node_modules/@pdf-lib/",
  ],
  // One prefix covers every MHFE panel module and the browser package.
  mhfe: MhfeIntegrationModules.markers,
  slip39: [
    "/recovery-slip39.ts",
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

/**
 * Sources that a pair of features needs: absent unless both are built. MnemoCode's own share code
 * (its sskr/ folder, no SSKR WebAssembly) comes with MnemoCode, since its backup check reads shares.
 */
const sharedSourceMarkers = [
  {
    label: "Worker BIP39 wordlist and accelerated seed provider (MnemoCode)",
    needed: (features) => features.has("mnemocode"),
    markers: ["/page-wordlist.ts", "/webcrypto-pbkdf2.ts"],
  },
  {
    // The checks of MnemoCode's coins come with the coins a build offers (AUD-023-BLD001).
    label: "MnemoCode's checks of every coin (the full build)",
    needed: (features) => DERIVER_COINS.every((coin) => features.hasCoin(coin)),
    markers: [
      "/recovery-mnemocode/source/core/coins-self-test.ts",
      "/recovery-mnemocode/source/core/coins/bitcoin-like-self-test.ts",
      "/recovery-mnemocode/source/core/coins/bitcoin-cash-self-test.ts",
      "/recovery-mnemocode/source/core/coins/cosmos-self-test.ts",
      "/recovery-mnemocode/source/core/coins/xrp-self-test.ts",
    ],
  },
  {
    label: "MnemoCode's Ethereum coin (Bitcoin's wallet evidence or Ethereum)",
    needed: (features) => features.hasCoin("bitcoin") || features.hasCoin("ethereum"),
    markers: [
      "/recovery-mnemocode/source/core/coins/ethereum.ts",
      "/recovery-mnemocode/source/core/coins/keccak-account.ts",
    ],
  },
  {
    // Ethereum Classic and Tron: Bitcoin's wallet evidence names every coin family; an edition
    // with Ethereum but no Bitcoin offers Ethereum alone (ethereum.ts).
    label: "MnemoCode's other EVM coins (Bitcoin's wallet evidence)",
    needed: (features) => features.hasCoin("bitcoin"),
    markers: ["/recovery-mnemocode/source/core/coins/evm.ts"],
  },
  {
    label: "MnemoCode's Ethereum address checks",
    needed: (features) => features.hasCoin("ethereum"),
    markers: [
      "/recovery-mnemocode/source/core/coins/ethereum-self-test.ts",
      "/recovery-mnemocode/source/core/coins/evm-self-test.ts",
    ],
  },
  {
    label: "MnemoCode's Dash address checks",
    needed: (features) => features.hasCoin("dash"),
    markers: ["/recovery-mnemocode/source/core/coins/dash-self-test.ts"],
  },
  {
    label: "MnemoCode shares (mnemocode with sskr)",
    needed: (features) => features.has("mnemocode") && features.has("sskr"),
    markers: [
      "/recovery-mnemocode-shares.ts",
      "/recovery-mnemocode-repair-times.ts",
      "/recovery-backup/src/mnemocode-shares.ts",
      "/mnemocode-shares-worker.ts",
    ],
  },
  {
    // Share cards, their renderer and their checks come only with share cards (AUD-023-BLD002).
    label: "MnemoCode share cards (mnemocode-cards with sskr)",
    needed: (features) => features.has("mnemocode-cards") && features.has("sskr"),
    markers: [
      "/self-test-mnemocode-share-cards.ts",
      "/recovery-backup/src/mnemocode-share-card-checks.ts",
      "/recovery-backup/src/mnemocode-share-render.ts",
      "/recovery-mnemocode/source/export/sskr-render.ts",
      "/recovery-mnemocode/source/export/sskr-render-self-test.ts",
    ],
  },
];

const QR_IMAGE_IMPORT_SOURCE = "packages/shared-ui/src/qr-image-import.ts";
const PNG_ADMISSION_SOURCE = "packages/shared-ui/src/png-admission.ts";
// Generic QR imports share this bounded PNG parser, even when MnemoCode is not offered.
// Keep the exception at exact files: the rest of the vendored library remains feature-gated.
const GENERIC_PNG_SOURCES = [
  "core/png-admission.ts",
  "core/byte-units.ts",
  "core/bits.ts",
  "core/bip39-sizes.ts",
  "core/pieces.ts",
  "core/places.ts",
  "core/typed-number.ts",
  "sskr/checksum.ts",
].map((file) => `packages/recovery-mnemocode/source/${file}`);

function matchesInput(path, source) {
  return path === source || path.endsWith(`/${source}`);
}

/** Fails the build if an excluded coin or feature still reaches either bundle graph. */
export function assertKeyDerivationComposition(features, inputPaths) {
  const normalized = inputPaths.map((path) => path.replaceAll("\\", "/"));
  const includesSource = (source) => normalized.some((path) => matchesInput(path, source));
  const qrImageImport = includesSource(QR_IMAGE_IMPORT_SOURCE);
  const allowedPngInputs = new Set(
    qrImageImport
      ? normalized.filter((path) =>
          GENERIC_PNG_SOURCES.some((source) => matchesInput(path, source)),
        )
      : [],
  );
  const assertAbsent = (label, markers, allowedInputs) => {
    const leaked = normalized.filter(
      (path) => !allowedInputs?.has(path) && markers.some((marker) => path.includes(marker)),
    );
    if (leaked.length > 0)
      throw new Error(
        `${label} is excluded but remains in the bundle graph:\n${leaked.join("\n")}`,
      );
  };
  for (const [coin, markers] of Object.entries(coinSourceMarkers)) {
    if (!features.hasCoin(coin)) assertAbsent(`Coin module ${coin}`, markers);
  }
  for (const [feature, markers] of Object.entries(featureSourceMarkers)) {
    if (!features.has(feature))
      assertAbsent(
        `Feature ${feature}`,
        markers,
        feature === "mnemocode" ? allowedPngInputs : undefined,
      );
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
      "/bip85-deriver.ts",
    ])
      requireInput("Feature bip85", marker);
  }
  if (features.has("silent-payments")) {
    requireInput("Feature silent-payments", "/silent-payment-feature.ts");
    requireInput("Feature silent-payments", "/silent-payment.ts");
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
}
