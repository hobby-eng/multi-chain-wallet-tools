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
  const methods = [];
  if (options.hasCoin('dash')) {
    imports.push(
      `import { DirectRecoveryNetworkService } from ${JSON.stringify(resolve(root, 'apps/discovery-scanner/src/network-service.ts'))};`,
    );
    setup.push('const dash = new DirectRecoveryNetworkService();');
    for (const name of [
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
    ]) {
      methods.push(`${name}(...args) { return dash.${name}(...args); }`);
    }
  }
  if (options.hasCoin('bitcoin')) {
    imports.push(
      `import { BitcoinPublicDataService } from ${JSON.stringify(resolve(root, 'packages/public-data-providers/src/bitcoin-service.ts'))};`,
    );
    setup.push('const bitcoin = new BitcoinPublicDataService();');
    methods.push(
      'bitcoinAddressHistory(network, address, signal) { return bitcoin.addressHistory(network, address, signal); }',
      'utxoAddresses(network, addresses, signal) { return bitcoin.utxoAddresses(network, addresses, signal); }',
    );
  }
  if (options.hasCoin('ethereum')) {
    imports.push(
      `import { EthereumPublicDataService } from ${JSON.stringify(resolve(root, 'packages/public-data-providers/src/ethereum-service.ts'))};`,
    );
    setup.push('const ethereum = new EthereumPublicDataService();');
    methods.push(
      'ethereumAddressHistory(network, address, signal) { return ethereum.addressHistory(network, address, signal); }',
      'evmAccounts(network, addresses, signal) { return ethereum.evmAccounts(network, addresses, signal); }',
    );
  }
  methods.push(
    options.hasCoin('dash')
      ? 'ping(signal) { return dash.ping(signal); }'
      : "ping(signal) { signal?.throwIfAborted(); return Promise.resolve('isolated-network-worker-v1'); }",
  );
  return `${imports.join('\n')}\n${setup.join('\n')}\nexport const selectedRecoveryNetworkService = { ${methods.join(',\n')} };`;
}

export function discoveryNetworkRuntimeSource(root, options) {
  const validation = JSON.stringify(resolve(root, 'packages/network-boundary/src/request-validation.ts'));
  const protocol = JSON.stringify(resolve(root, 'packages/network-boundary/src/protocol.ts'));
  const validators = [`'ping': (value) => { exactNetworkPayload(value, []); }`];
  const cases = [`case 'ping': return service.ping(signal);`];
  if (options.hasCoin('dash')) {
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
  if (options.hasCoin('bitcoin')) {
    historyCoins.push('bitcoin');
    validators.push(`'utxo.addresses': addressBatch(RECOVERY_UTXO_ADDRESS_BATCH)`);
    cases.push(
      `case 'utxo.addresses': return service.utxoAddresses(request.payload.network, request.payload.addresses, signal);`,
    );
  }
  if (options.hasCoin('ethereum')) {
    historyCoins.push('ethereum');
    validators.push(`'evm.accounts': addressBatch(RECOVERY_EVM_ACCOUNT_BATCH)`);
    cases.push(
      `case 'evm.accounts': return service.evmAccounts(request.payload.network, request.payload.addresses, signal);`,
    );
  }
  if (historyCoins.length > 0) {
    validators.push(
      `'address.history': (value) => { const body = exactNetworkPayload(value, ['coin', 'network', 'address']); if (!${JSON.stringify(historyCoins)}.includes(body.coin)) throw new Error('Public history coin is not included in this build.'); assertRecoveryNetwork(body.network); assertPublicToken(body.address, 'Address'); }`,
    );
    const routes = [];
    if (options.hasCoin('bitcoin'))
      routes.push(
        `if (request.payload.coin === 'bitcoin') return service.bitcoinAddressHistory(request.payload.network, request.payload.address, signal);`,
      );
    if (options.hasCoin('ethereum'))
      routes.push(
        `if (request.payload.coin === 'ethereum') return service.ethereumAddressHistory(request.payload.network, request.payload.address, signal);`,
      );
    cases.push(
      `case 'address.history': ${routes.join(' ')} throw new Error('Public history coin is not included in this build.');`,
    );
  }
  return `import { selectedRecoveryNetworkService as service } from 'ckd:selected-discovery-network-service';
import { RECOVERY_CORE_ADDRESS_BATCH, RECOVERY_PLATFORM_ADDRESS_BATCH, RECOVERY_UTXO_ADDRESS_BATCH, RECOVERY_EVM_ACCOUNT_BATCH } from ${protocol};
import { assertDecimal, assertHex, assertIntegerRange, assertPublicToken, assertPublicTokenBatch, assertRecoveryNetwork, exactNetworkPayload, validateNetworkRequest } from ${validation};
const networkOnly = (value) => { const body = exactNetworkPayload(value, ['network']); assertRecoveryNetwork(body.network); };
const publicField = (field) => (value) => { const body = exactNetworkPayload(value, ['network', field]); assertRecoveryNetwork(body.network); assertPublicToken(body[field], field); };
const addressBatch = (maximum) => (value) => { const body = exactNetworkPayload(value, ['network', 'addresses']); assertRecoveryNetwork(body.network); assertPublicTokenBatch(body.addresses, maximum); };
const validators = { ${validators.join(',\n')} };
export const validateSelectedRecoveryNetworkRequest = (value) => validateNetworkRequest(value, validators);
export async function executeSelectedRecoveryNetworkRequest(_service, request, signal) { switch (request.operation) { ${cases.join('\n')} default: throw new Error('Recovery Network Worker rejected an unsupported operation.'); } }`;
}

export function discoveryNetworkWorkerEntry(root) {
  return `import { selectedRecoveryNetworkService } from 'ckd:selected-discovery-network-service';
import { executeSelectedRecoveryNetworkRequest, validateSelectedRecoveryNetworkRequest } from 'ckd:selected-discovery-network-runtime';
import { startNetworkBoundaryWorker } from ${JSON.stringify(resolve(root, 'packages/network-boundary/src/worker-runtime.ts'))};
import { describeUnknownError, freeThrownValue } from ${JSON.stringify(resolve(root, 'packages/crypto-core/src/error-handling.ts'))};
startNetworkBoundaryWorker(selectedRecoveryNetworkService, executeSelectedRecoveryNetworkRequest, validateSelectedRecoveryNetworkRequest, (cause) => { const message = describeUnknownError(cause); freeThrownValue(cause); return message; });`;
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
    `boundaryDescription: ${JSON.stringify(
      options.has('seed-discovery')
        ? "Opaque-origin Secret Vault · connect-src/worker-src 'none' · isolated network worker · scan-end export tripwire · secret candidates discarded before download · shell export broker · max 5 requests"
        : "Opaque-origin Public Input Boundary · connect-src/worker-src 'none' · isolated network worker · validated public inputs only · shell export broker · max 5 requests",
    )}`,
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

function replaceBalancedElement(source, openingPattern, replacement = '') {
  const opening = openingPattern.exec(source);
  if (opening === null) return source;
  const tag = /^<([a-z][a-z0-9-]*)\b/iu.exec(opening[0])?.[1];
  if (tag === undefined) throw new Error('Discovery template selector did not start at an HTML element.');
  const token = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'giu');
  token.lastIndex = opening.index;
  let depth = 0;
  for (let match = token.exec(source); match !== null; match = token.exec(source)) {
    if (match[0].startsWith('</')) depth -= 1;
    else depth += 1;
    if (depth === 0) return source.slice(0, opening.index) + replacement + source.slice(token.lastIndex);
  }
  throw new Error(`Discovery template is missing the closing <${tag}> element.`);
}

export function applyDiscoveryFeatureTemplate(template, options) {
  if (options.has('seed-discovery')) return template;
  let rendered = template;
  for (const id of ['seed-source-tab', 'seed-source-panel']) {
    rendered = replaceBalancedElement(rendered, new RegExp(`<[^>]+\\bid=["']${id}["'][^>]*>`, 'iu'));
  }
  rendered = replaceBalancedElement(rendered, /<div\b[^>]*class=["'][^"']*\bsecret-actions\b[^"']*["'][^>]*>/iu);
  rendered = rendered
    .replace('class="recovery-mode-tab primary-mode-tab"', 'class="recovery-mode-tab primary-mode-tab active"')
    .replace('aria-selected="false"', 'aria-selected="true"')
    .replace(/\s+tabindex="-1"/u, '')
    .replace(
      '<strong>Enter locally</strong><small>BIP39 phrases or a public key</small>',
      '<strong>Enter locally</strong><small>Public keys only</small>',
    )
    .replace(
      /If funds are found,[\s\S]*?valuable funds on an untrusted computer\./u,
      'If funds are found, copy the public address, derivation path, branch/index and balance into the recovery report, then use the original wallet backup on a trusted device.',
    )
    .replace(
      /use your original recovery phrase or wallet backup,[\s\S]*?viewing key\./u,
      'use your original wallet backup, confirm the listed derivation paths, and move funds to a newly generated wallet. The export contains public recovery metadata only; no private or spending material is included.',
    )
    .replaceAll('Secret Vault', 'Public Input Boundary')
    .replaceAll('secret candidates', 'public inputs');
  for (const id of [
    'seed-source-tab',
    'seed-source-panel',
    'single-mnemonic',
    'single-passphrase',
    'batch-mnemonics',
    'batch-passphrases',
  ]) {
    if (new RegExp(`\\bid=["']${id}["']`, 'u').test(rendered)) {
      throw new Error(`Watch-only Discovery template retained seed control #${id}.`);
    }
  }
  return rendered;
}

export function createDiscoveryCompositionPlugin(root, options) {
  const sources = new Map([
    ['ckd:selected-discovery-registry', registrySource(root, options)],
    ['ckd:selected-discovery-network-service', networkServiceSource(root, options)],
    ['ckd:selected-discovery-network-runtime', discoveryNetworkRuntimeSource(root, options)],
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
  requireInput('runtime network request validation', '/network-boundary/src/request-validation.ts');
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
