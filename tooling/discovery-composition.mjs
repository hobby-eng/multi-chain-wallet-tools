import { resolve } from 'node:path';

function selectedAdapter(coin, options) {
  const upper = coin.toUpperCase();
  if (options.has('seed-discovery') && options.has('watch-only-discovery')) {
    return [`${upper}_RECOVERY_ADAPTER`, `apps/discovery-scanner/src/coins/${coin}/index.ts`];
  }
  if (options.has('seed-discovery')) {
    return [`${upper}_SEED_RECOVERY_ADAPTER`, `apps/discovery-scanner/src/coins/${coin}/seed.ts`];
  }
  return [`${upper}_WATCH_ONLY_RECOVERY_ADAPTER`, `apps/discovery-scanner/src/coins/${coin}/watch-adapter.ts`];
}

function registrySource(root, options) {
  const adapters = options.coins.map((coin) => selectedAdapter(coin, options));
  const lines = adapters.map(([symbol, file]) => `import { ${symbol} } from ${JSON.stringify(resolve(root, file))};`);
  return `${lines.join('\n')}
import { createRecoveryCoinRegistry } from ${JSON.stringify(resolve(root, 'apps/discovery-scanner/src/coins/registry.ts'))};
export const { getRecoveryCoin, listRecoveryCoins } = createRecoveryCoinRegistry([${adapters.map(([symbol]) => symbol).join(', ')}]);`;
}

function networkServiceSource(root, options) {
  const imports = [];
  const setup = [];
  if (options.hasCoin('dash')) {
    imports.push(
      `import { DirectRecoveryNetworkService } from ${JSON.stringify(resolve(root, 'apps/discovery-scanner/src/network-service.ts'))};`,
    );
    setup.push('const dash = new DirectRecoveryNetworkService();');
  }
  if (options.hasCoin('bitcoin')) {
    imports.push(
      `import { BitcoinPublicDataService } from ${JSON.stringify(resolve(root, 'packages/public-data-providers/src/bitcoin-service.ts'))};`,
    );
    setup.push('const bitcoin = new BitcoinPublicDataService();');
  }
  if (options.hasCoin('ethereum')) {
    imports.push(
      `import { EthereumPublicDataService } from ${JSON.stringify(resolve(root, 'packages/public-data-providers/src/ethereum-service.ts'))};`,
    );
    setup.push('const ethereum = new EthereumPublicDataService();');
  }
  const dashMethods = [
    'coreStatus',
    'coreTip',
    'coreAddressInfo',
    'coreAddressHistory',
    'coreTransaction',
    'platformAddresses',
    'platformAddressHistory',
    'platformIdentityByPublicKeyHash',
    'platformIdentityHistory',
    'shieldedPage',
  ];
  const methods = dashMethods.map(
    (name) =>
      `${name}(...args) { ${options.hasCoin('dash') ? `return dash.${name}(...args);` : "return Promise.reject(new Error('Dash is not included in this build.'));"} }`,
  );
  methods.push(
    `ping(signal) { ${options.hasCoin('dash') ? 'return dash.ping(signal);' : "signal?.throwIfAborted(); return Promise.resolve('isolated-network-worker-v1');"} }`,
  );
  methods.push(`addressHistory(coin, network, address, signal) {
    if (coin === 'bitcoin' && ${options.hasCoin('bitcoin')}) return bitcoin.addressHistory(network, address, signal);
    if (coin === 'ethereum' && ${options.hasCoin('ethereum')}) return ethereum.addressHistory(network, address, signal);
    return Promise.reject(new Error('The requested coin is not included in this build.'));
  }`);
  methods.push(
    `utxoAddresses(network, addresses, signal) { ${options.hasCoin('bitcoin') ? 'return bitcoin.utxoAddresses(network, addresses, signal);' : "return Promise.reject(new Error('The UTXO provider is not included in this build.'));"} }`,
  );
  methods.push(
    `evmAccounts(network, addresses, signal) { ${options.hasCoin('ethereum') ? 'return ethereum.evmAccounts(network, addresses, signal);' : "return Promise.reject(new Error('The account provider is not included in this build.'));"} }`,
  );
  return `${imports.join('\n')}\n${setup.join('\n')}\nexport const selectedRecoveryNetworkService = { ${methods.join(',\n')} };`;
}

export function discoveryNetworkWorkerEntry(root) {
  return `import { selectedRecoveryNetworkService } from 'ckd:selected-discovery-network-service';
import { startNetworkBoundaryWorker } from ${JSON.stringify(resolve(root, 'packages/network-boundary/src/worker-runtime.ts'))};
import { executeRecoveryNetworkRequest } from ${JSON.stringify(resolve(root, 'apps/discovery-scanner/src/network-executor.ts'))};
import { describeUnknownError, freeThrownValue } from ${JSON.stringify(resolve(root, 'packages/crypto-core/src/error-handling.ts'))};
startNetworkBoundaryWorker(selectedRecoveryNetworkService, executeRecoveryNetworkRequest, (cause) => { const message = describeUnknownError(cause); freeThrownValue(cause); return message; });`;
}

export function discoveryAppEntry(root, options) {
  const lines = [
    `import * as registry from 'ckd:selected-discovery-registry';`,
    `import { startDiscoveryScanner } from ${JSON.stringify(resolve(root, 'apps/discovery-scanner/src/start.ts'))};`,
  ];
  if (options.has('seed-discovery')) {
    lines.push(
      `import { assertValidMnemonic } from ${JSON.stringify(resolve(root, 'packages/crypto-core/src/bip39.ts'))};`,
    );
    lines.push(`import { runRecoverySelfTest } from 'ckd:selected-discovery-self-test';`);
    lines.push(
      `import { installVaultViewportBridge } from ${JSON.stringify(resolve(root, 'apps/discovery-scanner/src/viewport-client.ts'))};`,
    );
    lines.push('installVaultViewportBridge();');
  } else {
    lines.push(
      "const assertValidMnemonic = () => { throw new Error('Seed discovery is not included in this build.'); };",
    );
    lines.push(
      "const runRecoverySelfTest = async () => ({ passed: true, checks: ['Watch-only public-input boundary'], durationMs: 0 });",
    );
  }
  if (options.has('wallet-matcher') && options.hasCoin('bitcoin') && options.has('seed-discovery')) {
    lines.push(
      `import { createBitcoinAddressSearchRunner } from ${JSON.stringify(resolve(root, 'apps/discovery-scanner/src/address-search-feature.ts'))};`,
    );
    lines.push(
      `import { getBitcoinAddressSearchAdapter } from ${JSON.stringify(resolve(root, 'apps/discovery-scanner/src/bitcoin-address-search-runtime.ts'))};`,
    );
    lines.push('const addressSearch = createBitcoinAddressSearchRunner(getBitcoinAddressSearchAdapter);');
  } else lines.push('const addressSearch = undefined;');
  lines.push("import { SELECTED_WATCH_ONLY_PROFILE } from 'ckd:selected-watch-only-profile';");
  lines.push("import { SELECTED_DISCOVERY_FEATURES } from 'ckd:selected-discovery-features';");
  lines.push(
    'startDiscoveryScanner(registry, runRecoverySelfTest, assertValidMnemonic, SELECTED_DISCOVERY_FEATURES, addressSearch, SELECTED_WATCH_ONLY_PROFILE);',
  );
  return lines.join('\n');
}

function selfTestSource(root, options) {
  const modules = [];
  if (options.hasCoin('bitcoin'))
    modules.push(['runBitcoinDerivationSelfTest', 'packages/verification/src/derivation-self-test-bitcoin.ts']);
  if (options.hasCoin('dash'))
    modules.push(['runDashDerivationSelfTest', 'packages/verification/src/derivation-self-test-dash.ts']);
  if (options.hasCoin('ethereum'))
    modules.push(['runEthereumDerivationSelfTest', 'packages/verification/src/derivation-self-test-ethereum.ts']);
  const imports = modules.map(([symbol, file]) => `import { ${symbol} } from ${JSON.stringify(resolve(root, file))};`);
  return `${imports.join('\n')}
import { runBip39SelfTest } from ${JSON.stringify(resolve(root, 'packages/verification/src/bip39-self-test.ts'))};
import { createRecoverySelfTest } from ${JSON.stringify(resolve(root, 'apps/discovery-scanner/src/recovery-self-test.ts'))};
export const runRecoverySelfTest = createRecoverySelfTest(async () => { const reports = [runBip39SelfTest(), ${modules.map(([symbol]) => `${symbol}()`).join(', ')}]; const values = await Promise.all(reports); if (values.some((report) => report.passed !== true)) throw new Error('A selected Discovery self-test did not pass.'); return { passed: true, checks: values.flatMap((report) => report.checks), durationMs: values.reduce((sum, report) => sum + report.durationMs, 0) }; });`;
}

function watchOnlyProfileSource(root, options) {
  if (!options.has('watch-only-discovery')) return 'export const SELECTED_WATCH_ONLY_PROFILE = undefined;';
  const prefixes = {};
  if (options.hasCoin('bitcoin'))
    Object.assign(prefixes, { 'bitcoin-xpub': 'bitcoin', 'bitcoin-descriptor': 'bitcoin' });
  if (options.hasCoin('dash'))
    Object.assign(prefixes, {
      'dash-xpub': 'dash',
      'dash-descriptor': 'dash',
      'dash-legacy-xpub': 'dash',
      'dash-orchard': 'dash',
    });
  if (options.hasCoin('ethereum')) Object.assign(prefixes, { 'ethereum-xpub': 'ethereum' });
  const depthCases = [];
  if (options.hasCoin('bitcoin')) depthCases.push("if (adapterId === 'bitcoin') return [3, 4];");
  if (options.hasCoin('dash')) depthCases.push("if (adapterId === 'dash') return [3, 4, 5];");
  if (options.hasCoin('ethereum')) depthCases.push("if (adapterId === 'ethereum') return [3, 4, 5];");
  return `export const SELECTED_WATCH_ONLY_PROFILE = { prefixCoins: ${JSON.stringify(prefixes)}, multiChain: ${options.coins.length > 1}, networklessAdapterIds: ${JSON.stringify(options.hasCoin('ethereum') ? ['ethereum'] : [])}, supportedDepths: (adapterId) => { ${depthCases.join(' ')} throw new Error('Unsupported watch-only adapter.'); }, singleChainCoinId: ${JSON.stringify(options.coins[0])} };`;
}

function featureRuntimeSource(root, options) {
  const imports = [];
  const fields = [
    `seedDiscovery: ${options.has('seed-discovery')}`,
    `watchOnlyDiscovery: ${options.has('watch-only-discovery')}`,
    `walletMatcher: ${options.has('wallet-matcher')}`,
    `customPaths: ${options.has('custom-paths')}`,
  ];
  if (options.has('seed-discovery')) {
    imports.push(
      `import { scanCandidates, candidateSummary } from ${JSON.stringify(resolve(root, 'apps/discovery-scanner/src/candidate-scan.ts'))};`,
      `import { createRecoverySeedInputs, recoveryScanConfig, wipeRecoverySeedInputs } from ${JSON.stringify(resolve(root, 'apps/discovery-scanner/src/seed-scan-input.ts'))};`,
    );
    fields.push(
      'scanCandidates',
      'candidateSummary',
      'createRecoverySeedInputs',
      'recoveryScanConfig',
      'wipeRecoverySeedInputs',
    );
  }
  if (options.has('custom-paths')) {
    imports.push(
      `import { customScanPaths, parseCustomAccountRange } from ${JSON.stringify(resolve(root, 'apps/discovery-scanner/src/coins/custom-path.ts'))};`,
    );
    imports.push(
      `import { describeCustomPath, editCustomPath } from ${JSON.stringify(resolve(root, 'apps/discovery-scanner/src/custom-path-editor.ts'))};`,
    );
    fields.push('customScanPaths', 'parseCustomAccountRange', 'describeCustomPath', 'editCustomPath');
  }
  if (options.has('watch-only-discovery')) {
    imports.push(
      `import { assertWatchOnlyBatchInput, assertWatchOnlyMinimum, parseWatchOnlyLines, resolveWatchOnlyTargets } from ${JSON.stringify(resolve(root, 'packages/wallet-recovery/src/watch-only.ts'))};`,
      `import { resolveWatchOnlyScanTargets, watchOnlyScanConfig, wipeWatchOnlyTargets } from ${JSON.stringify(resolve(root, 'apps/discovery-scanner/src/watch-only-input.ts'))};`,
    );
    fields.push(
      'assertWatchOnlyBatchInput',
      'assertWatchOnlyMinimum',
      'parseWatchOnlyLines',
      'resolveWatchOnlyTargets',
      'resolveWatchOnlyScanTargets',
      'watchOnlyScanConfig',
      'wipeWatchOnlyTargets',
    );
  }
  return `${imports.join('\n')}\nexport const SELECTED_DISCOVERY_FEATURES = { ${fields.join(', ')} };`;
}

export function createDiscoveryCompositionPlugin(root, options) {
  const sources = new Map([
    ['ckd:selected-discovery-registry', registrySource(root, options)],
    ['ckd:selected-discovery-network-service', networkServiceSource(root, options)],
    ['ckd:selected-discovery-self-test', selfTestSource(root, options)],
    ['ckd:selected-watch-only-profile', watchOnlyProfileSource(root, options)],
    ['ckd:selected-discovery-features', featureRuntimeSource(root, options)],
  ]);
  return {
    name: 'discovery-composition',
    setup(build) {
      if (!options.has('custom-paths')) {
        build.onResolve({ filter: /(?:^|\/)custom-path\.js$/ }, () => ({
          path: 'ckd:disabled-custom-paths',
          namespace: 'ckd-discovery-selection',
        }));
      }
      build.onResolve({ filter: /^ckd:selected-/ }, ({ path }) => ({ path, namespace: 'ckd-discovery-selection' }));
      build.onLoad({ filter: /.*/, namespace: 'ckd-discovery-selection' }, ({ path }) => ({
        contents:
          path === 'ckd:disabled-custom-paths'
            ? `export function customScanPaths() { return { length: 0, *[Symbol.iterator]() {} }; }
export function appendCustomPaths(standard) { return { length: standard.length, *[Symbol.iterator]() { yield* standard; } }; }
export function parseCustomAccountRange() { throw new Error('Custom paths are not included in this build.'); }
export function parseCustomPathTemplate() { throw new Error('Custom paths are not included in this build.'); }`
            : sources.get(path),
        loader: 'ts',
        resolveDir: root,
      }));
    },
  };
}

export function assertDiscoveryComposition(options, inputs) {
  const normalized = inputs.map((input) => input.replaceAll('\\', '/'));
  const markers = {
    bitcoin: ['/coins/bitcoin/', '/bitcoin-service.ts', '/bitcoin-address-search-runtime.ts'],
    dash: ['/coins/dash/', '/network-service.ts', '/dash-network/', '/@dashevo/evo-sdk/'],
    ethereum: ['/coins/ethereum/', '/ethereum-service.ts'],
  };
  for (const [coin, values] of Object.entries(markers)) {
    if (options.hasCoin(coin)) continue;
    const leaked = normalized.filter((input) => values.some((marker) => input.includes(marker)));
    if (leaked.length)
      throw new Error(`Discovery Scanner excluded ${coin}, but its modules remain:\n${leaked.join('\n')}`);
  }

  const featureMarkers = {
    'seed-discovery': ['/seed-scan-input.ts', '/candidate-scan.ts'],
    'watch-only-discovery': ['/wallet-recovery/src/watch-only', '/watch-adapter.ts', '/watch-only.ts'],
    'wallet-matcher': ['/address-search-feature.ts', '/bitcoin-address-search-runtime.ts'],
    'custom-paths': ['/coins/custom-path.ts', '/custom-path-editor.ts'],
  };
  for (const [feature, values] of Object.entries(featureMarkers)) {
    if (options.has(feature)) continue;
    const leaked = normalized.filter((input) => values.some((marker) => input.includes(marker)));
    if (leaked.length)
      throw new Error(`Discovery Scanner excluded ${feature}, but its modules remain:\n${leaked.join('\n')}`);
  }
  if (!options.has('seed-discovery')) {
    const leaked = normalized.filter(
      (input) => input.includes('/crypto-core/src/bip39.ts') || input.includes('/secret-vault/'),
    );
    if (leaked.length) throw new Error(`Watch-only Discovery contains seed/Vault modules:\n${leaked.join('\n')}`);
  }
  const requireInput = (label, marker) => {
    if (!normalized.some((input) => input.includes(marker)))
      throw new Error(`Discovery Scanner selected ${label}, but ${marker} is absent from the bundle graph.`);
  };
  for (const coin of options.coins) requireInput(`${coin} coin support`, `/coins/${coin}/`);
  if (options.has('seed-discovery')) {
    requireInput('seed-discovery', '/seed-scan-input.ts');
    requireInput('the Secret Vault lifecycle', '/secret-vault/src/worker-bootstrap.ts');
  }
  if (options.has('watch-only-discovery')) requireInput('watch-only-discovery', '/watch-only-input.ts');
  if (options.has('custom-paths')) requireInput('custom-paths', '/coins/custom-path.ts');
  if (options.has('wallet-matcher') && options.hasCoin('bitcoin'))
    requireInput('wallet-matcher', '/address-search-feature.ts');
}
