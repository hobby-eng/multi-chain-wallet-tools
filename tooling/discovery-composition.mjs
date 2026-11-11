import {
  COMBINED_SELF_TEST_MODULE,
  DERIVATION_SELF_TESTS,
  LOCAL_SEARCH_SELF_TEST,
} from "./derivation-self-tests.mjs";
import {
  ACCOUNT_SHARED_MARKERS,
  accountReadersSource,
  isAccountCoin,
  selectedAccountCoins,
  unselectedAccountMarkers,
} from "./account-coins.mjs";
import {
  EVM_HISTORY_MARKERS,
  EVM_SHARED_MARKERS,
  evmWalletCoin,
  hasEvmHistory,
  isEvmCoin,
  selectedEvmHistoryNetworks,
  selectedEvmNetworks,
} from "./evm-networks.mjs";
import {
  needsSharedModule,
  SHARED_MODULES,
  singleKeyAddressesModule,
  singleKeyCoinMarkers,
} from "./single-key-coins.mjs";
import { replaceBalancedElement as replaceHtmlElement } from "./html-elements.mjs";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

const WATCH_ONLY_PREFIX_COINS = JSON.parse(
  readFileSync(
    new URL("../packages/wallet-recovery/src/watch-only/prefix-coins.json", import.meta.url),
    "utf8",
  ),
);

function selectedAdapter(coin, options) {
  const upper = coin.toUpperCase();
  if (options.has("seed-discovery") && options.has("watch-only-discovery")) {
    return [`${upper}_RECOVERY_ADAPTER`, `apps/discovery-scanner/src/coins/${coin}/index.ts`];
  }
  if (options.has("seed-discovery")) {
    return [`${upper}_SEED_RECOVERY_ADAPTER`, `apps/discovery-scanner/src/coins/${coin}/seed.ts`];
  }
  return [
    `${upper}_WATCH_ONLY_RECOVERY_ADAPTER`,
    `apps/discovery-scanner/src/coins/${coin}/watch-adapter.ts`,
  ];
}

/** The EVM factory of the selected scans: seed and watch-only, seed only, or watch-only only. */
function evmFactory(options) {
  if (options.has("seed-discovery") && options.has("watch-only-discovery"))
    return ["createEvmRecoveryAdapter", "apps/discovery-scanner/src/coins/evm/index.ts"];
  if (options.has("seed-discovery"))
    return ["createEvmSeedRecoveryAdapter", "apps/discovery-scanner/src/coins/evm/seed.ts"];
  return [
    "createEvmWatchOnlyRecoveryAdapter",
    "apps/discovery-scanner/src/coins/evm/watch-adapter.ts",
  ];
}

/** The history reader that an EVM network whose row names a history endpoint adds to its row. */
const EVM_HISTORY = ["evmHistory", "apps/discovery-scanner/src/coins/evm/history.ts"];

/** The privacy note of a build's EVM networks, built from their rows' operators. */
const EVM_PRIVACY = ["evmNetworkPrivacy", "apps/discovery-scanner/src/coins/evm/coin.ts"];

/**
 * The Deriver coins whose address schemes lay out the selected EVM networks' own wallets (Ethereum
 * Classic's); only a seed scan derives them, so a build without seed discovery has none.
 */
function selectedEvmWalletCoins(options) {
  if (!options.has("seed-discovery")) return [];
  return selectedEvmNetworks(options).flatMap((row) => evmWalletCoin(row) ?? []);
}

/** The seed factory of every account coin; the policy admits account coins with seed discovery only. */
const ACCOUNT_SEED_FACTORY = [
  "createAccountSeedRecoveryAdapter",
  "apps/discovery-scanner/src/coins/account/seed.ts",
];

function registrySource(root, options) {
  const evm = new Map(selectedEvmNetworks(options).map((row) => [row.id, row]));
  const accounts = new Map(selectedAccountCoins(options).map((row) => [row.id, row]));
  const walletCoins = selectedEvmWalletCoins(options);
  const imports = new Map();
  const entries = options.coins.map((coin) => {
    const account = accounts.get(coin);
    if (account !== undefined) {
      // Each account coin is its row, inlined, and the Deriver's derivation of the same coin.
      const addresses = singleKeyAddressesModule(coin);
      imports.set(...ACCOUNT_SEED_FACTORY);
      imports.set(addresses.symbol, addresses.file);
      return `${ACCOUNT_SEED_FACTORY[0]}(${JSON.stringify(account)}, ${addresses.symbol})`;
    }
    const row = evm.get(coin);
    if (row === undefined) {
      const [symbol, file] = selectedAdapter(coin, options);
      imports.set(symbol, file);
      return symbol;
    }
    // Each EVM network is its row of the EVM network table, inlined, so that the build names no
    // other network, with the privacy note of the build's networks, its history where its row names
    // one, and its own wallets' layouts where its Deriver coin has them.
    const [factory, file] = evmFactory(options);
    imports.set(factory, file);
    imports.set(...EVM_PRIVACY);
    const extras = ["privacy: evmPrivacy"];
    if (hasEvmHistory(row)) {
      imports.set(...EVM_HISTORY);
      extras.push(`getHistory: ${EVM_HISTORY[0]}(${JSON.stringify(coin)})`);
    }
    const walletCoin = evmWalletCoin(row);
    if (walletCoin !== undefined && walletCoins.includes(walletCoin)) {
      const addresses = singleKeyAddressesModule(walletCoin);
      imports.set(addresses.symbol, addresses.file);
      extras.push(`addresses: ${addresses.symbol}`);
    }
    return `${factory}(${JSON.stringify(row)}, { ${extras.join(", ")} })`;
  });
  const lines = [...imports].map(
    ([symbol, file]) => `import { ${symbol} } from ${JSON.stringify(resolve(root, file))};`,
  );
  const privacy =
    evm.size === 0
      ? ""
      : `const evmPrivacy = ${EVM_PRIVACY[0]}(${JSON.stringify([...evm.values()].map(({ rpcOperator }) => ({ rpcOperator })))});\n`;
  return `${lines.join("\n")}
import { createRecoveryCoinRegistry } from ${JSON.stringify(resolve(root, "apps/discovery-scanner/src/coins/registry.ts"))};
${privacy}export const { getRecoveryCoin, listRecoveryCoins } = createRecoveryCoinRegistry([${entries.join(", ")}]);`;
}

function networkServiceSource(root, options) {
  const imports = [];
  const setup = [];
  const methods = [];
  if (options.hasCoin("dash")) {
    imports.push(
      `import { DirectRecoveryNetworkService } from ${JSON.stringify(resolve(root, "apps/discovery-scanner/src/network-service.ts"))};`,
    );
    setup.push("const dash = new DirectRecoveryNetworkService();");
    for (const name of [
      "coreStatus",
      "coreTip",
      "coreAddressInfo",
      "coreAddressHistory",
      "coreTransaction",
      "platformAddresses",
      "platformAddressHistory",
      "platformIdentityByPublicKeyHash",
      "platformIdentityHistory",
      "shieldedPage",
    ]) {
      methods.push(`${name}(...args) { return dash.${name}(...args); }`);
    }
  }
  if (options.hasCoin("bitcoin")) {
    imports.push(
      `import { BitcoinPublicDataService } from ${JSON.stringify(resolve(root, "packages/public-data-providers/src/bitcoin-service.ts"))};`,
    );
    setup.push("const bitcoin = new BitcoinPublicDataService();");
    methods.push(
      "bitcoinAddressHistory(network, address, signal) { return bitcoin.addressHistory(network, address, signal); }",
      "utxoAddresses(network, addresses, signal) { return bitcoin.utxoAddresses(network, addresses, signal); }",
    );
  }
  const evm = selectedEvmNetworks(options);
  if (evm.length > 0) {
    imports.push(
      `import { EvmAccountService } from ${JSON.stringify(resolve(root, "packages/public-data-providers/src/evm-service.ts"))};`,
    );
    setup.push(`const evm = new EvmAccountService(${JSON.stringify(evm)});`);
    methods.push(
      "evmAccounts(coin, network, addresses, signal) { return evm.accounts(coin, network, addresses, signal); }",
    );
  }
  // The selected networks whose rows name a history endpoint, each read from its own Blockscout root.
  const histories = selectedEvmHistoryNetworks(options);
  if (histories.length > 0) {
    imports.push(
      `import { EvmHistoryService } from ${JSON.stringify(resolve(root, "packages/public-data-providers/src/evm-history-service.ts"))};`,
    );
    setup.push(`const evmHistory = new EvmHistoryService(${JSON.stringify(histories)});`);
    methods.push(
      "evmAddressHistory(coin, network, address, signal) { return evmHistory.addressHistory(coin, network, address, signal); }",
    );
  }
  const accounts = selectedAccountCoins(options);
  if (accounts.length > 0) {
    // Each account coin is its row, inlined, with its api's provider.
    const { imports: readerImports, readers } = accountReadersSource(accounts, (file) =>
      JSON.stringify(resolve(root, file)),
    );
    imports.push(
      `import { AccountStatesService } from ${JSON.stringify(resolve(root, "packages/public-data-providers/src/account-states-service.ts"))};`,
      ...readerImports,
    );
    setup.push(`const accounts = new AccountStatesService(${readers});`);
    methods.push(
      "accountStates(coin, network, addresses, signal) { return accounts.states(coin, network, addresses, signal); }",
      "validateAccountStates(value) { accounts.validatePayload(value); }",
    );
  }
  methods.push(
    options.hasCoin("dash")
      ? "ping(signal) { return dash.ping(signal); }"
      : "ping(signal) { signal?.throwIfAborted(); return Promise.resolve('isolated-network-worker-v1'); }",
  );
  return `${imports.join("\n")}\n${setup.join("\n")}\nexport const selectedRecoveryNetworkService = { ${methods.join(",\n")} };`;
}

export function discoveryNetworkRuntimeSource(root, options) {
  const validation = JSON.stringify(
    resolve(root, "packages/network-boundary/src/request-validation.ts"),
  );
  const protocol = JSON.stringify(resolve(root, "packages/network-boundary/src/protocol.ts"));
  const validators = [`'ping': (value) => { exactNetworkPayload(value, []); }`];
  const cases = [`case 'ping': return service.ping(signal);`];
  if (options.hasCoin("dash")) {
    validators.push(
      `'core.status': networkOnly`,
      `'core.tip': networkOnly`,
      `'core.address-info': addressBatch(RECOVERY_CORE_ADDRESS_BATCH)`,
      `'core.address-history': publicField('address')`,
      `'core.transaction': (value) => { const body = exactNetworkPayload(value, ['network', 'hash']); assertRecoveryNetwork(body.network); assertHex(body.hash, 32, 'Transaction hash'); }`,
      `'platform.addresses': addressBatch(RECOVERY_PLATFORM_ADDRESS_BATCH)`,
      `'platform.address-history': publicField('address')`,
      `'platform.identity-by-public-key-hash': (value) => { const body = exactNetworkPayload(value, ['network', 'publicKeyHashHex']); assertRecoveryNetwork(body.network); assertHex(body.publicKeyHashHex, 20, 'Platform public-key hash'); }`,
      `'platform.identity-history': publicField('identifier')`,
      `'shielded.page': (value) => { const body = exactNetworkPayload(value, ['network', 'startPosition', 'count']); assertRecoveryNetwork(body.network); assertDecimal(body.startPosition, 'Shielded page start position'); assertIntegerRange(body.count, 1, 8192, 'Shielded page count'); }`,
    );
    cases.push(
      `case 'core.status': return service.coreStatus(request.payload.network, signal);`,
      `case 'core.tip': return service.coreTip(request.payload.network, signal);`,
      `case 'core.address-info': return service.coreAddressInfo(request.payload.network, request.payload.addresses, signal);`,
      `case 'core.address-history': return service.coreAddressHistory(request.payload.network, request.payload.address, signal);`,
      `case 'core.transaction': return service.coreTransaction(request.payload.network, request.payload.hash, signal);`,
      `case 'platform.addresses': return service.platformAddresses(request.payload.network, request.payload.addresses, signal);`,
      `case 'platform.address-history': return service.platformAddressHistory(request.payload.network, request.payload.address, signal);`,
      `case 'platform.identity-by-public-key-hash': return service.platformIdentityByPublicKeyHash(request.payload.network, request.payload.publicKeyHashHex, signal);`,
      `case 'platform.identity-history': return service.platformIdentityHistory(request.payload.network, request.payload.identifier, signal);`,
      `case 'shielded.page': return service.shieldedPage(request.payload.network, request.payload.startPosition, request.payload.count, signal);`,
    );
  }
  const historyCoins = [];
  if (options.hasCoin("bitcoin")) {
    historyCoins.push("bitcoin");
    validators.push(`'utxo.addresses': addressBatch(RECOVERY_UTXO_ADDRESS_BATCH)`);
    cases.push(
      `case 'utxo.addresses': return service.utxoAddresses(request.payload.network, request.payload.addresses, signal);`,
    );
  }
  const evmHistoryIds = selectedEvmHistoryNetworks(options).map(({ id }) => id);
  historyCoins.push(...evmHistoryIds);
  const evmIds = selectedEvmNetworks(options).map(({ id }) => id);
  const evmImport = [];
  if (evmIds.length > 0) {
    evmImport.push(
      `import { validateEvmAccountsPayload } from ${JSON.stringify(resolve(root, "packages/public-data-providers/src/evm-network-facts.ts"))};`,
    );
    validators.push(
      `'evm.accounts': (value) => validateEvmAccountsPayload(value, ${JSON.stringify(evmIds)})`,
    );
    cases.push(
      `case 'evm.accounts': return service.evmAccounts(request.payload.coin, request.payload.network, request.payload.addresses, signal);`,
    );
  }
  if (selectedAccountCoins(options).length > 0) {
    // The service of the selected rows refuses what it would refuse, before any request.
    validators.push(`'account.states': (value) => service.validateAccountStates(value)`);
    cases.push(
      `case 'account.states': return service.accountStates(request.payload.coin, request.payload.network, request.payload.addresses, signal);`,
    );
  }
  if (historyCoins.length > 0) {
    validators.push(
      `'address.history': (value) => { const body = exactNetworkPayload(value, ['coin', 'network', 'address']); assertOneOf(body.coin, ${JSON.stringify(historyCoins)}, 'Public history coin'); assertRecoveryNetwork(body.network); assertPublicToken(body.address, 'Address'); }`,
    );
    const routes = [];
    if (options.hasCoin("bitcoin"))
      routes.push(
        `if (request.payload.coin === 'bitcoin') return service.bitcoinAddressHistory(request.payload.network, request.payload.address, signal);`,
      );
    if (evmHistoryIds.length > 0)
      routes.push(
        `if (${JSON.stringify(evmHistoryIds)}.includes(request.payload.coin)) return service.evmAddressHistory(request.payload.coin, request.payload.network, request.payload.address, signal);`,
      );
    cases.push(
      `case 'address.history': ${routes.join(" ")} throw new Error('Public history coin is not included in this build.');`,
    );
  }
  return `import { selectedRecoveryNetworkService as service } from 'ckd:selected-discovery-network-service';
${evmImport.join("\n")}
import { RECOVERY_CORE_ADDRESS_BATCH, RECOVERY_PLATFORM_ADDRESS_BATCH, RECOVERY_UTXO_ADDRESS_BATCH } from ${protocol};
import { assertDecimal, assertHex, assertIntegerRange, assertOneOf, assertPublicToken, assertPublicTokenBatch, assertRecoveryNetwork, exactNetworkPayload, validateNetworkRequest } from ${validation};
const networkOnly = (value) => { const body = exactNetworkPayload(value, ['network']); assertRecoveryNetwork(body.network); };
const publicField = (field) => (value) => { const body = exactNetworkPayload(value, ['network', field]); assertRecoveryNetwork(body.network); assertPublicToken(body[field], field); };
const addressBatch = (maximum) => (value) => { const body = exactNetworkPayload(value, ['network', 'addresses']); assertRecoveryNetwork(body.network); assertPublicTokenBatch(body.addresses, maximum); };
const validators = { ${validators.join(",\n")} };
export const validateSelectedRecoveryNetworkRequest = (value) => validateNetworkRequest(value, validators);
export async function executeSelectedRecoveryNetworkRequest(_service, request, signal) { switch (request.operation) { ${cases.join("\n")} default: throw new Error('Recovery Network Worker rejected an unsupported operation.'); } }`;
}

export function discoveryNetworkWorkerEntry(root) {
  return `import { selectedRecoveryNetworkService } from 'ckd:selected-discovery-network-service';
import { executeSelectedRecoveryNetworkRequest, validateSelectedRecoveryNetworkRequest } from 'ckd:selected-discovery-network-runtime';
import { startNetworkBoundaryWorker } from ${JSON.stringify(resolve(root, "packages/network-boundary/src/worker-runtime.ts"))};
import { describeUnknownError, freeThrownValue } from ${JSON.stringify(resolve(root, "packages/crypto-core/src/error-handling.ts"))};
startNetworkBoundaryWorker(selectedRecoveryNetworkService, executeSelectedRecoveryNetworkRequest, validateSelectedRecoveryNetworkRequest, (cause) => { const message = describeUnknownError(cause); freeThrownValue(cause); return message; });`;
}

function hasLocalAddressSearch(options) {
  return (
    options.has("wallet-matcher") && options.hasCoin("bitcoin") && options.has("seed-discovery")
  );
}

export function discoveryAppEntry(root, options) {
  const lines = [
    `import * as registry from 'ckd:selected-discovery-registry';`,
    `import { startDiscoveryScanner } from ${JSON.stringify(resolve(root, "apps/discovery-scanner/src/start.ts"))};`,
    `import { installVaultViewportBridge } from ${JSON.stringify(resolve(root, "apps/discovery-scanner/src/viewport-client.ts"))};`,
  ];
  lines.push("installVaultViewportBridge();");
  if (options.has("seed-discovery")) {
    lines.push(
      `import { assertValidMnemonic } from ${JSON.stringify(resolve(root, "packages/crypto-core/src/bip39.ts"))};`,
    );
    lines.push(`import { runRecoverySelfTest } from 'ckd:selected-discovery-self-test';`);
  } else {
    lines.push(
      "const assertValidMnemonic = () => { throw new Error('Seed discovery is not included in this build.'); };",
    );
    lines.push(
      `import { createPublicInputBoundarySelfTest } from ${JSON.stringify(resolve(root, "apps/discovery-scanner/src/recovery-self-test.ts"))};`,
    );
    lines.push("const runRecoverySelfTest = createPublicInputBoundarySelfTest();");
  }
  if (hasLocalAddressSearch(options)) {
    lines.push(
      `import { createBitcoinAddressSearchRunner } from ${JSON.stringify(resolve(root, "apps/discovery-scanner/src/address-search-feature.ts"))};`,
    );
    lines.push(
      `import { getBitcoinAddressSearchAdapter } from ${JSON.stringify(resolve(root, "apps/discovery-scanner/src/bitcoin-address-search-runtime.ts"))};`,
    );
    lines.push(
      "const addressSearch = createBitcoinAddressSearchRunner(getBitcoinAddressSearchAdapter);",
    );
  } else lines.push("const addressSearch = undefined;");
  lines.push("import { SELECTED_WATCH_ONLY_PROFILE } from 'ckd:selected-watch-only-profile';");
  lines.push("import { SELECTED_DISCOVERY_FEATURES } from 'ckd:selected-discovery-features';");
  lines.push(
    "startDiscoveryScanner(registry, runRecoverySelfTest, assertValidMnemonic, SELECTED_DISCOVERY_FEATURES, addressSearch, SELECTED_WATCH_ONLY_PROFILE);",
  );
  return lines.join("\n");
}

function selfTestSource(root, options) {
  // Every EVM network derives Ethereum's accounts, so any of them brings Ethereum's known answers;
  // an EVM network with its own wallets' layouts brings its Deriver coin's, whose scheme derives
  // them.
  const evm = selectedEvmNetworks(options).length > 0;
  const walletCoins = selectedEvmWalletCoins(options);
  const modules = Object.entries(DERIVATION_SELF_TESTS)
    .filter(
      ([coin]) =>
        (options.hasCoin(coin) && !isEvmCoin(coin)) ||
        (coin === "ethereum" && evm) ||
        walletCoins.includes(coin),
    )
    .map(([, module]) => module);
  // The candidate lists come with seed discovery, which is the only build of this self-test.
  modules.push([
    "runCandidateListSelfTest",
    "apps/discovery-scanner/src/candidate-list-self-test.ts",
  ]);
  // Watch-only discovery screens its public inputs with the public-input guard, in the same
  // vault, so the guard's known answers run wherever it is built.
  if (options.has("watch-only-discovery"))
    modules.push([
      "runPublicInputGuardStartupCheck",
      "apps/discovery-scanner/src/public-input-self-test.ts",
    ]);
  if (hasLocalAddressSearch(options))
    modules.push([LOCAL_SEARCH_SELF_TEST.symbol, LOCAL_SEARCH_SELF_TEST.module]);
  const imports = modules.map(
    ([symbol, file]) => `import { ${symbol} } from ${JSON.stringify(resolve(root, file))};`,
  );
  return `${imports.join("\n")}
import { runBip39SelfTest } from ${JSON.stringify(resolve(root, "packages/verification/src/bip39-self-test.ts"))};
import { createRecoverySelfTest } from ${JSON.stringify(resolve(root, "apps/discovery-scanner/src/recovery-self-test.ts"))};
import { combinedSelfTest } from ${JSON.stringify(resolve(root, COMBINED_SELF_TEST_MODULE))};
export const runRecoverySelfTest = createRecoverySelfTest(() => combinedSelfTest([runBip39SelfTest, ${modules.map(([symbol]) => symbol).join(", ")}]));`;
}

function watchOnlyProfileSource(root, options) {
  if (!options.has("watch-only-discovery"))
    return "export const SELECTED_WATCH_ONLY_PROFILE = undefined;";
  const selectedCoins = new Set(options.coins);
  const prefixCoins = Object.fromEntries(
    Object.entries(WATCH_ONLY_PREFIX_COINS).filter(([, coin]) => selectedCoins.has(coin)),
  );
  const depthCases = [];
  if (options.hasCoin("bitcoin")) depthCases.push("if (adapterId === 'bitcoin') return [3, 4];");
  if (options.hasCoin("dash")) depthCases.push("if (adapterId === 'dash') return [3, 4, 5];");
  // An xpub names no EVM chain: every EVM network takes the selected network and indexed keys.
  const evmIds = selectedEvmNetworks(options).map(({ id }) => id);
  if (evmIds.length > 0)
    depthCases.push(`if (${JSON.stringify(evmIds)}.includes(adapterId)) return [3, 4, 5];`);
  // An account coin has no public-key scan: the coins of this profile are the others.
  const watchCoins = options.coins.filter((coin) => !isAccountCoin(coin));
  return `const prefixCoins = ${JSON.stringify(prefixCoins)};
export const SELECTED_WATCH_ONLY_PROFILE = { prefixCoins, multiChain: ${watchCoins.length > 1}, networklessAdapterIds: ${JSON.stringify(evmIds)}, supportedDepths: (adapterId) => { ${depthCases.join(" ")} throw new Error('Unsupported watch-only adapter.'); }, singleChainCoinId: ${JSON.stringify(watchCoins[0])} };`;
}

function featureRuntimeSource(root, options) {
  const imports = [];
  const fields = [
    `seedDiscovery: ${options.has("seed-discovery")}`,
    `watchOnlyDiscovery: ${options.has("watch-only-discovery")}`,
    `walletMatcher: ${options.has("wallet-matcher")}`,
    `customPaths: ${options.has("custom-paths")}`,
    `boundaryDescription: ${JSON.stringify(
      options.has("seed-discovery")
        ? "Opaque-origin Secret Vault · connect-src/worker-src 'none' · isolated network worker · scan-end export tripwire · secret candidates discarded before download · shell export broker · max 5 requests"
        : "Opaque-origin Public Input Boundary · connect-src/worker-src 'none' · isolated network worker · validated public inputs only · shell export broker · max 5 requests",
    )}`,
  ];
  if (options.has("seed-discovery")) {
    imports.push(
      `import { scanCandidates, candidateSummary } from ${JSON.stringify(resolve(root, "apps/discovery-scanner/src/candidate-scan.ts"))};`,
      `import { createRecoverySeedInputs, recoveryScanConfig, wipeRecoverySeedInputs } from ${JSON.stringify(resolve(root, "apps/discovery-scanner/src/seed-scan-input.ts"))};`,
      `import { CandidateListImport } from ${JSON.stringify(resolve(root, "apps/discovery-scanner/src/candidate-list-import.ts"))};`,
    );
    fields.push(
      "scanCandidates",
      "candidateSummary",
      "createRecoverySeedInputs",
      "recoveryScanConfig",
      "wipeRecoverySeedInputs",
      "CandidateListImport",
    );
  }
  if (options.has("custom-paths")) {
    imports.push(
      `import { customScanPaths, parseCustomAccountRange } from ${JSON.stringify(resolve(root, "apps/discovery-scanner/src/coins/custom-path.ts"))};`,
    );
    imports.push(
      `import { describeCustomPath, editCustomPath } from ${JSON.stringify(resolve(root, "apps/discovery-scanner/src/custom-path-editor.ts"))};`,
    );
    fields.push(
      "customScanPaths",
      "parseCustomAccountRange",
      "describeCustomPath",
      "editCustomPath",
    );
  }
  if (options.has("watch-only-discovery")) {
    imports.push(
      `import { assertWatchOnlyBatchInput, assertWatchOnlyMinimum, parseWatchOnlyLines, resolveWatchOnlyTargets } from ${JSON.stringify(resolve(root, "packages/wallet-recovery/src/watch-only.ts"))};`,
      `import { resolveWatchOnlyScanTargets, watchOnlyScanConfig, wipeWatchOnlyTargets } from ${JSON.stringify(resolve(root, "apps/discovery-scanner/src/watch-only-input.ts"))};`,
    );
    fields.push(
      "assertWatchOnlyBatchInput",
      "assertWatchOnlyMinimum",
      "parseWatchOnlyLines",
      "resolveWatchOnlyTargets",
      "resolveWatchOnlyScanTargets",
      "watchOnlyScanConfig",
      "wipeWatchOnlyTargets",
    );
  }
  return `${imports.join("\n")}\nexport const SELECTED_DISCOVERY_FEATURES = { ${fields.join(", ")} };`;
}

const replaceBalancedElement = (source, openingPattern, replacement = "") =>
  replaceHtmlElement(source, openingPattern, replacement, "Discovery template");

export function applyDiscoveryFeatureTemplate(template, options) {
  if (options.has("seed-discovery")) return template;
  let rendered = template;
  for (const id of ["seed-source-tab", "seed-source-panel"]) {
    rendered = replaceBalancedElement(
      rendered,
      new RegExp(`<[^>]+\\bid=["']${id}["'][^>]*>`, "iu"),
    );
  }
  rendered = replaceBalancedElement(
    rendered,
    /<div\b[^>]*class=["'][^"']*\bsecret-actions\b[^"']*["'][^>]*>/iu,
  );
  rendered = rendered
    .replace(
      'class="recovery-mode-tab primary-mode-tab"',
      'class="recovery-mode-tab primary-mode-tab active"',
    )
    .replace('aria-selected="false"', 'aria-selected="true"')
    .replace(/\s+tabindex="-1"/u, "")
    .replace(
      "<strong>Enter locally</strong><small>BIP39 phrases or a public key</small>",
      "<strong>Enter locally</strong><small>Public keys only</small>",
    )
    .replace(
      /If funds are found,[\s\S]*?valuable funds on an untrusted computer\./u,
      "If funds are found, copy the public address, derivation path, branch/index and balance into the recovery report, then use the original wallet backup on a trusted device.",
    )
    .replace(
      /use your original recovery phrase or wallet backup,[\s\S]*?viewing key\./u,
      "use your original wallet backup, confirm the listed derivation paths, and move funds to a newly generated wallet. The export contains public recovery metadata only; no private or spending material is included.",
    )
    .replace(
      /For the broadest search across supported(?: Dash)? wallet schemes, use your seed phrase and original BIP39 passphrase, if any\.(?: Trying different formats for one xpub does not search the separate Legacy, SegWit and Taproot accounts\.)?/u,
      "This watch-only build cannot search separate hardened accounts that are not reachable from the entered public key.",
    )
    .replace(
      /No persistence, analytics, cookies, external scripts, or secret-bearing network requests\. Mnemonic, seed and Orchard FVK remain inside a CSP network-denied (?:Secret Vault|Public Input Boundary); Evo SDK runs in a separate Worker\./u,
      "No persistence, analytics, cookies, external scripts, or private-key input. Entered public keys remain inside a CSP network-denied Public Input Boundary; only derived public requests cross into the Network Worker.",
    )
    .replaceAll("Secret Vault", "Public Input Boundary")
    .replaceAll("secret candidates", "public inputs");
  for (const id of [
    "seed-source-tab",
    "seed-source-panel",
    "single-mnemonic",
    "single-passphrase",
    "batch-mnemonics",
    "batch-passphrases",
  ]) {
    if (new RegExp(`\\bid=["']${id}["']`, "u").test(rendered)) {
      throw new Error(`Watch-only Discovery template retained seed control #${id}.`);
    }
  }
  return rendered;
}

export function createDiscoveryCompositionPlugin(root, options) {
  const sources = new Map([
    ["ckd:selected-discovery-registry", registrySource(root, options)],
    ["ckd:selected-discovery-network-service", networkServiceSource(root, options)],
    ["ckd:selected-discovery-network-runtime", discoveryNetworkRuntimeSource(root, options)],
    ["ckd:selected-discovery-self-test", selfTestSource(root, options)],
    ["ckd:selected-watch-only-profile", watchOnlyProfileSource(root, options)],
    ["ckd:selected-discovery-features", featureRuntimeSource(root, options)],
  ]);
  return {
    name: "discovery-composition",
    setup(build) {
      if (!options.has("custom-paths")) {
        build.onResolve({ filter: /(?:^|\/)custom-path\.js$/ }, () => ({
          path: "ckd:disabled-custom-paths",
          namespace: "ckd-discovery-selection",
        }));
      }
      build.onResolve({ filter: /^ckd:selected-/ }, ({ path }) => ({
        path,
        namespace: "ckd-discovery-selection",
      }));
      build.onLoad({ filter: /.*/, namespace: "ckd-discovery-selection" }, ({ path }) => ({
        contents:
          path === "ckd:disabled-custom-paths"
            ? `export function customScanPaths() { return { length: 0, *[Symbol.iterator]() {} }; }
export function appendCustomPaths(standard) { return { length: standard.length, *[Symbol.iterator]() { yield* standard; } }; }
export function parseCustomAccountRange() { throw new Error('Custom paths are not included in this build.'); }
export function parseCustomPathTemplate() { throw new Error('Custom paths are not included in this build.'); }`
            : sources.get(path),
        loader: "ts",
        resolveDir: root,
      }));
    },
  };
}

export function assertDiscoveryComposition(options, inputs) {
  const normalized = inputs.map((input) => input.replaceAll("\\", "/"));
  const markers = {
    bitcoin: [
      "/coins/bitcoin/",
      "/bitcoin-service.ts",
      "/bitcoin-address-search-runtime.ts",
      "/wallet-recovery/src/watch-only/bitcoin.ts",
    ],
    dash: [
      "/coins/dash/",
      "/network-service.ts",
      "/network-validation.ts",
      "/dash-core-network.ts",
      "/dash-platform-network.ts",
      "/dash-network/",
      "/@dashevo/evo-sdk/",
    ],
    ethereum: ["/discovery-scanner/src/coins/ethereum/"],
  };
  const evm = selectedEvmNetworks(options).length > 0;
  // Without any EVM network, Ethereum's derivation and every shared EVM module stay out too, but
  // for the Keccak account that Tron's addresses share (tooling/single-key-coins.mjs).
  if (!evm)
    markers.ethereum.push(
      "/coins/ethereum/",
      ...EVM_SHARED_MARKERS.filter(
        (marker) =>
          marker !== SHARED_MODULES["keccak-account"].marker ||
          !needsSharedModule(options.hasCoin, "keccak-account"),
      ),
    );
  for (const [coin, values] of Object.entries(markers)) {
    if (options.hasCoin(coin)) continue;
    const leaked = normalized.filter((input) => values.some((marker) => input.includes(marker)));
    if (leaked.length)
      throw new Error(
        `Discovery Scanner excluded ${coin}, but its modules remain:\n${leaked.join("\n")}`,
      );
  }

  const featureMarkers = {
    "seed-discovery": [
      "/seed-scan-input.ts",
      "/candidate-scan.ts",
      "/candidate-list-import.ts",
      "/candidate-list-self-test.ts",
      "/recovery-backup/src/mnemocode-engine.ts",
      "/recovery-mnemocode-wasm/",
    ],
    "watch-only-discovery": [
      "/wallet-recovery/src/watch-only",
      "/watch-adapter.ts",
      "/watch-only.ts",
      "/public-input-self-test.ts",
    ],
    "wallet-matcher": ["/address-search-feature.ts", "/bitcoin-address-search-runtime.ts"],
    "custom-paths": ["/coins/custom-path.ts", "/custom-path-editor.ts"],
  };
  for (const [feature, values] of Object.entries(featureMarkers)) {
    if (options.has(feature)) continue;
    const leaked = normalized.filter((input) => values.some((marker) => input.includes(marker)));
    if (leaked.length)
      throw new Error(
        `Discovery Scanner excluded ${feature}, but its modules remain:\n${leaked.join("\n")}`,
      );
  }
  if (!hasLocalAddressSearch(options)) {
    const leaked = normalized.filter((input) =>
      LOCAL_SEARCH_SELF_TEST.sourceMarkers.some((marker) => input.includes(marker)),
    );
    if (leaked.length)
      throw new Error(
        `Discovery Scanner excluded local address search, but its self-test remains:\n${leaked.join("\n")}`,
      );
  }
  if (!options.has("seed-discovery")) {
    const leaked = normalized.filter(
      (input) => input.includes("/crypto-core/src/bip39.ts") || input.includes("/secret-vault/"),
    );
    if (leaked.length)
      throw new Error(`Watch-only Discovery contains seed/Vault modules:\n${leaked.join("\n")}`);
  }
  const requireInput = (label, marker) => {
    if (!normalized.some((input) => input.includes(marker)))
      throw new Error(
        `Discovery Scanner selected ${label}, but ${marker} is absent from the bundle graph.`,
      );
  };
  requireInput("runtime network request validation", "/network-boundary/src/request-validation.ts");
  for (const coin of options.coins)
    if (!isEvmCoin(coin)) requireInput(`${coin} coin support`, `/coins/${coin}/`);
  // Each selected network whose row names a history endpoint reads it; without one, no EVM history
  // module stays.
  const histories = selectedEvmHistoryNetworks(options);
  for (const { id } of histories)
    for (const marker of Object.values(EVM_HISTORY_MARKERS)) requireInput(`${id} history`, marker);
  if (histories.length === 0) {
    const leaked = normalized.filter((input) =>
      Object.values(EVM_HISTORY_MARKERS).some((marker) => input.includes(marker)),
    );
    if (leaked.length)
      throw new Error(
        `Discovery Scanner selected no EVM history, but its modules remain:\n${leaked.join("\n")}`,
      );
  }
  // An EVM network's own wallets' layouts come with its Deriver coin's scheme and derivation
  // self-test in a seed build, and with neither module of that coin in a build without seed scans.
  const walletCoins = selectedEvmWalletCoins(options);
  for (const coin of walletCoins) {
    requireInput(`${coin} wallet layouts`, singleKeyAddressesModule(coin).file);
    requireInput(`${coin} derivation self-test`, `derivation-self-test-${coin}.ts`);
  }
  const absentWallets = selectedEvmNetworks(options).flatMap((row) => {
    const coin = evmWalletCoin(row);
    return coin === undefined || walletCoins.includes(coin) ? [] : singleKeyCoinMarkers(coin);
  });
  const leakedWallets = normalized.filter((input) =>
    absentWallets.some((marker) => input.includes(marker)),
  );
  if (leakedWallets.length)
    throw new Error(
      `Discovery Scanner scans no seed, but EVM wallet layout modules remain:\n${leakedWallets.join("\n")}`,
    );
  // Each selected account coin's provider, the modules they share, and no unselected coin's modules.
  const accounts = selectedAccountCoins(options);
  for (const { api } of accounts) requireInput("account coins", `/account-coins/${api}.ts`);
  const accountShared = ACCOUNT_SHARED_MARKERS["discovery-scanner"];
  if (accounts.length > 0)
    for (const marker of accountShared) requireInput("account coins", marker);
  const absentAccounts = [
    ...unselectedAccountMarkers(options),
    ...(accounts.length > 0 ? [] : accountShared),
  ];
  const leakedAccounts = normalized.filter((input) =>
    absentAccounts.some((marker) => input.includes(marker)),
  );
  if (leakedAccounts.length)
    throw new Error(
      `Discovery Scanner excluded account coins, but their modules remain:\n${leakedAccounts.join("\n")}`,
    );
  if (evm)
    for (const marker of EVM_SHARED_MARKERS)
      if (marker !== "/watch-only/evm.ts" || options.has("watch-only-discovery"))
        requireInput("EVM network support", marker);
  if (options.has("seed-discovery")) {
    requireInput("seed-discovery", "/seed-scan-input.ts");
    requireInput("the Secret Vault lifecycle", "/secret-vault/src/worker-bootstrap.ts");
  }
  if (options.has("watch-only-discovery"))
    requireInput("watch-only-discovery", "/watch-only-input.ts");
  if (options.has("custom-paths")) requireInput("custom-paths", "/coins/custom-path.ts");
  if (hasLocalAddressSearch(options)) {
    requireInput("wallet-matcher", "/address-search-feature.ts");
    for (const marker of LOCAL_SEARCH_SELF_TEST.sourceMarkers)
      requireInput("Local address search startup self-test", marker);
  }
}
