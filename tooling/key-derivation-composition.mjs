import { resolve } from 'node:path';

const adapterModules = {
  bitcoin: ['BITCOIN_COIN_ADAPTERS', 'packages/coin-protocols/src/coins/adapters/bitcoin.ts'],
  dash: ['DASH_COIN_ADAPTERS', 'packages/coin-protocols/src/coins/adapters/dash.ts'],
  ethereum: ['ETHEREUM_COIN_ADAPTERS', 'packages/coin-protocols/src/coins/adapters/ethereum.ts'],
};

function selectedRegistrySource(root, coins) {
  const imports = coins.map(
    (coin) => `import { ${adapterModules[coin][0]} } from ${JSON.stringify(resolve(root, adapterModules[coin][1]))};`,
  );
  const spreads = coins.map((coin) => `...${adapterModules[coin][0]}`).join(', ');
  return `${imports.join('\n')}
import { createCoinRegistry } from ${JSON.stringify(resolve(root, 'packages/coin-protocols/src/coins/registry-base.ts'))};
export const { COIN_ADAPTERS, COIN_FAMILIES, getAdapterFamilyId, getCoinAdapter, getCoinFamily, getDefaultCoinAdapter } = createCoinRegistry([${spreads}]);`;
}

function selectedRuntimeSource(root, coins) {
  const imports = [`import { getCoinAdapter } from 'ckd:selected-coin-registry';`];
  const dispatch = [];
  if (coins.includes('bitcoin')) {
    imports.push(
      `import { deriveBitcoin } from ${JSON.stringify(resolve(root, 'packages/coin-protocols/src/coins/bitcoin/index.ts'))};`,
    );
    dispatch.push(`const bitcoinMode = ({'bitcoin-legacy':'legacy','bitcoin-nested-segwit':'nested-segwit','bitcoin-native-segwit':'native-segwit','bitcoin-taproot':'taproot'})[id];
if (bitcoinMode !== undefined) return { ...metadata, derive: (input) => deriveBitcoin(bitcoinMode, input) };`);
  }
  if (coins.includes('ethereum')) {
    imports.push(
      `import { deriveEthereum } from ${JSON.stringify(resolve(root, 'packages/coin-protocols/src/coins/ethereum/index.ts'))};`,
    );
    dispatch.push(`if (id === 'ethereum') return { ...metadata, derive: deriveEthereum };`);
  }
  if (coins.includes('dash')) {
    for (const [symbol, file] of [
      ['deriveDashCoinJoin', 'coinjoin'],
      ['deriveDashCore', 'core'],
      ['deriveDashLegacyMobile', 'legacy-mobile'],
      ['deriveDashIdentity', 'identity'],
      ['deriveDashMultisig, deriveDashCoreMultisig', 'multisig'],
      ['deriveDashPlatform', 'platform'],
    ])
      imports.push(
        `import { ${symbol} } from ${JSON.stringify(resolve(root, `packages/coin-protocols/src/coins/dash/${file}.ts`))};`,
      );
    dispatch.push(`if (id === 'dash-core-coinjoin') return { ...getCoinAdapter('dash-core'), id, derive: deriveDashCoinJoin };
if (id === 'dash-core') return { ...metadata, derive: deriveDashCore };
if (id === 'dash-legacy-mobile') return { ...metadata, derive: deriveDashLegacyMobile };
if (id === 'dash-platform') return { ...metadata, derive: deriveDashPlatform };
if (id === 'dash-identity') return { ...metadata, derive: deriveDashIdentity };
if (id === 'dash-multisig-p2sh') return { ...metadata, derive: deriveDashMultisig };
if (id === 'dash-multisig-core-pkh') return { ...metadata, derive: deriveDashCoreMultisig };
if (id === 'dash-shielded') return { ...metadata, derive: async (input) => {
  const { deriveDashShielded } = await import(${JSON.stringify(resolve(root, 'packages/coin-protocols/src/coins/dash/shielded.ts'))});
  return deriveDashShielded(input);
} };`);
  }
  return `${imports.join('\n')}
export function getRuntimeCoinAdapter(id) {
  const metadata = id === 'dash-core-coinjoin' ? undefined : getCoinAdapter(id);
  ${dispatch.join('\n')}
  throw new Error('Unsupported derivation protocol in this build: ' + id + '.');
}`;
}

function selectedSelfTestSource(root, coins) {
  if (coins.length === 3) {
    return `export { runDerivationSelfTest } from ${JSON.stringify(resolve(root, 'packages/verification/src/derivation-self-test.ts'))};`;
  }
  if (coins.length === 1 && coins[0] === 'dash') {
    return `export { runDashDerivationSelfTest as runDerivationSelfTest } from ${JSON.stringify(resolve(root, 'packages/verification/src/derivation-self-test-dash.ts'))};`;
  }
  const definitions = {
    bitcoin: ['runBitcoinDerivationSelfTest', 'packages/verification/src/derivation-self-test-bitcoin.ts'],
    dash: ['runDashDerivationSelfTest', 'packages/verification/src/derivation-self-test-dash.ts'],
    ethereum: ['runEthereumDerivationSelfTest', 'packages/verification/src/derivation-self-test-ethereum.ts'],
  };
  const imports = coins.map(
    (coin) => `import { ${definitions[coin][0]} } from ${JSON.stringify(resolve(root, definitions[coin][1]))};`,
  );
  const calls = coins.map((coin) => `${definitions[coin][0]}()`).join(', ');
  return `${imports.join('\n')}
export async function runDerivationSelfTest() {
  const reports = await Promise.all([${calls}]);
  return { passed: reports.every((report) => report.passed), checks: reports.flatMap((report) => report.checks), durationMs: reports.reduce((sum, report) => sum + report.durationMs, 0) };
}`;
}

function selectedMatcherSource(root, features) {
  if (!features.has('wallet-matcher')) {
    return `export function detectSelectedMatcherTargets() { throw new Error('Wallet Matcher is not included in this build.'); }`;
  }
  const { coins } = features;
  const imports = [];
  if (coins.includes('bitcoin'))
    imports.push(
      `import { detectBitcoinAddressTarget } from ${JSON.stringify(resolve(root, 'packages/wallet-recovery/src/address-targets.ts'))};`,
    );
  if (coins.includes('dash'))
    imports.push(
      `import { detectDashMatcherTargets } from ${JSON.stringify(resolve(root, 'packages/wallet-recovery/src/matcher-targets-dash.ts'))};`,
    );
  const allAdapters = {
    bitcoin: ['bitcoin-legacy', 'bitcoin-nested-segwit', 'bitcoin-native-segwit', 'bitcoin-taproot'],
    dash: ['dash-core', 'dash-legacy-mobile', 'dash-core-coinjoin', 'dash-platform', 'dash-shielded'],
    ethereum: ['ethereum'],
  };
  const allowed = coins.flatMap((coin) => allAdapters[coin]);
  const attempts = [];
  if (coins.includes('ethereum'))
    attempts.push(
      `if (/^0x[0-9a-f]{40}$/iu.test(value)) return { input: value, normalized: value.toLowerCase(), network, adapterIds: ['ethereum'] };`,
    );
  if (coins.includes('bitcoin'))
    attempts.push(
      `try { const target = detectBitcoinAddressTarget(value, network); return { input: value, normalized: target.normalized, network, adapterIds: [target.adapterId] }; } catch {}`,
    );
  if (coins.includes('dash'))
    attempts.push(
      `try { const [target] = detectDashMatcherTargets(value, network, false); if (target !== undefined) return target; } catch {}`,
    );
  return `${imports.join('\n')}
const ALL_ADAPTERS = ${JSON.stringify(allowed)};
function detectOne(value, network) { ${attempts.join('\n')} throw new Error('Address is not recognized by the coin modules in this build.'); }
export function detectSelectedMatcherTargets(input, network, forceAllProfiles) {
  const values = input.replaceAll('\\r', '').split('\\n').map((value) => value.trim()).filter(Boolean);
  if (values.length === 0) throw new Error('Enter at least one known address.');
  const seen = new Set();
  return values.map((value, index) => {
    let detected;
    try { detected = detectOne(value, network); } catch { throw new Error('Address ' + (index + 1) + ' is not recognized for the selected network and coin modules.'); }
    if (seen.has(detected.normalized)) throw new Error('Address ' + (index + 1) + ' duplicates an earlier address.');
    seen.add(detected.normalized);
    return { ...detected, id: 'address-' + (index + 1), adapterIds: forceAllProfiles && detected.fieldKeys === undefined ? ALL_ADAPTERS : detected.adapterIds };
  });
}`;
}

function selectedRecoverySelfTestSource(root, features) {
  const definitions = [
    ['seedqr', 'runSeedQrSelfTest', 'self-test-seedqr.ts'],
    ['slip39', 'runSlip39SelfTest', 'self-test-slip39.ts'],
    ['shamir', 'runShamirSelfTest', 'self-test-shamir.ts'],
    ['codex32', 'runCodex32SelfTest', 'self-test-codex32.ts'],
    ['sskr', 'runSskrSelfTest', 'self-test-sskr.ts'],
    ['gordian-envelope', 'runGordianEnvelopeSelfTest', 'self-test-gordian-envelope.ts'],
  ].filter(([feature]) => features.has(feature));
  const imports = definitions.map(
    ([, symbol, file]) =>
      `import { ${symbol} } from ${JSON.stringify(resolve(root, 'packages/recovery-backup/src', file))};`,
  );
  const calls = definitions.map(([, symbol]) => `${symbol}()`).join(', ');
  return `${imports.join('\n')}
export function runRecoveryBackupSelfTest() {
  const reports = [${calls}];
  return { passed: reports.every((report) => report.passed), checks: reports.flatMap((report) => report.checks), durationMs: reports.reduce((sum, report) => sum + report.durationMs, 0) };
}`;
}

export function createKeyDerivationCompositionPlugin(root, features) {
  const modules = new Map([
    ['ckd:selected-coin-registry', selectedRegistrySource(root, features.coins)],
    ['ckd:selected-runtime-registry', selectedRuntimeSource(root, features.coins)],
    ['ckd:selected-derivation-self-test', selectedSelfTestSource(root, features.coins)],
    ['ckd:selected-matcher-targets', selectedMatcherSource(root, features)],
    ['ckd:selected-recovery-self-test', selectedRecoverySelfTestSource(root, features)],
  ]);
  return {
    name: 'key-derivation-composition',
    setup(build) {
      build.onResolve({ filter: /^ckd:selected-/ }, ({ path }) => ({ path, namespace: 'ckd-selection' }));
      build.onResolve({ filter: /^@ckd\/coins\/(?:registry|dash-registry)\.js$/ }, () => ({
        path: 'ckd:selected-coin-registry',
        namespace: 'ckd-selection',
      }));
      build.onResolve({ filter: /^@ckd\/recovery\/matcher-targets-(?:multichain|dash)\.js$/ }, () => ({
        path: 'ckd:selected-matcher-targets',
        namespace: 'ckd-selection',
      }));
      build.onResolve({ filter: /^@ckd\/recovery-backup\/self-test\.js$/ }, () => ({
        path: 'ckd:selected-recovery-self-test',
        namespace: 'ckd-selection',
      }));
      build.onLoad({ filter: /.*/, namespace: 'ckd-selection' }, ({ path }) => ({
        contents: modules.get(path),
        loader: 'ts',
        resolveDir: root,
      }));
    },
  };
}

export function selectedWorkerEntry(root, profile, features) {
  const imports = [
    `import { getRuntimeCoinAdapter } from 'ckd:selected-runtime-registry';`,
    `import { runDerivationSelfTest } from 'ckd:selected-derivation-self-test';`,
    `import { startDerivationWorker } from ${JSON.stringify(resolve(root, 'apps/key-derivation/src/workers/worker-runtime.ts'))};`,
  ];
  const properties = ['getRuntimeCoinAdapter', 'runDerivationSelfTest'];
  const optional = [
    ['silent-payments', 'deriveSilentPayment', 'silent-payment.ts'],
    ['bip85', 'deriveBip85', 'bip85-deriver.ts'],
    [
      'bip38-encrypt',
      'encryptDerivedP2pkhKey',
      features.hasCoin('bitcoin') ? 'bip38-encrypter.ts' : 'bip38-encrypter-dash.ts',
    ],
    [
      'message-signing',
      'signDerivedMessage',
      features.hasCoin('bitcoin') ? 'message-signer.ts' : 'message-signer-dash.ts',
    ],
  ];
  for (const [feature, symbol, file] of optional) {
    if (!features.has(feature)) continue;
    imports.push(
      `import { ${symbol} } from ${JSON.stringify(resolve(root, 'apps/key-derivation/src/workers', file))};`,
    );
    properties.push(symbol);
  }
  return `${imports.join('\n')}\nstartDerivationWorker({ ${properties.join(', ')} });`;
}

export function selectedUiEntry(root) {
  return `import * as registry from 'ckd:selected-coin-registry';
import { detectSelectedMatcherTargets } from 'ckd:selected-matcher-targets';
import { startKeyDerivationApp } from ${JSON.stringify(resolve(root, 'apps/key-derivation/src/ui/app-bootstrap.ts'))};
startKeyDerivationApp(registry, detectSelectedMatcherTargets);`;
}

const coinSourceMarkers = {
  bitcoin: ['/coins/bitcoin/', '/adapters/bitcoin.ts', 'derivation-self-test-bitcoin.ts', 'btcutil-js'],
  dash: ['/coins/dash/', '/adapters/dash.ts', 'derivation-self-test-dash.ts', 'dash-shielded-wasm'],
  ethereum: ['/coins/ethereum/', '/adapters/ethereum.ts', 'derivation-self-test-ethereum.ts'],
};

const featureSourceMarkers = {
  bip85: ['/bip85-feature.ts', '/bip85-child-wallet-feature.ts', '/bip85-deriver.ts'],
  'silent-payments': ['/silent-payment-feature.ts', '/silent-payment.ts'],
  'bip38-encrypt': ['/bip38-encryption-feature.ts', '/bip38-encrypter.ts', '/bip38-encrypter-dash.ts'],
  'message-signing': ['/message-signing-feature.ts', '/message-signer.ts', '/message-signer-dash.ts'],
  'wallet-matcher': ['/recovery-wallet-matcher.ts'],
  seedqr: ['/recovery-seedqr.ts', '/recovery-backup/src/seedqr.ts', '/self-test-seedqr.ts'],
  mhfe: ['/recovery-mhfe.ts', '/mhfe-backup-worker.ts', '/recovery-mhfe-wasm/'],
  slip39: ['/recovery-slip39.ts', '/recovery-backup/src/slip39.ts', '/slip39-wordlist.ts', '/self-test-slip39.ts'],
  shamir: ['/recovery-shamir.ts', '/recovery-backup/src/shamir.ts', '/recovery-shamir-wasm/', '/self-test-shamir.ts'],
  sskr: ['/recovery-sskr.ts', '/recovery-backup/src/sskr.ts', '/recovery-sskr-wasm/', '/self-test-sskr.ts'],
  'gordian-envelope': [
    '/recovery-gordian-envelope.ts',
    '/recovery-backup/src/gordian-envelope.ts',
    '/recovery-envelope-wasm/',
    '/self-test-gordian-envelope.ts',
  ],
  codex32: [
    '/recovery-codex32.ts',
    '/recovery-backup/src/codex32.ts',
    '/recovery-codex32-wasm/',
    '/self-test-codex32.ts',
  ],
};

/** Fails the build if an excluded coin or feature still reaches either bundle graph. */
export function assertKeyDerivationComposition(features, inputPaths) {
  const normalized = inputPaths.map((path) => path.replaceAll('\\', '/'));
  const assertAbsent = (label, markers) => {
    const leaked = normalized.filter((path) => markers.some((marker) => path.includes(marker)));
    if (leaked.length > 0)
      throw new Error(`${label} is excluded but remains in the bundle graph:\n${leaked.join('\n')}`);
  };
  for (const [coin, markers] of Object.entries(coinSourceMarkers)) {
    if (!features.hasCoin(coin)) assertAbsent(`Coin module ${coin}`, markers);
  }
  for (const [feature, markers] of Object.entries(featureSourceMarkers)) {
    if (!features.has(feature)) assertAbsent(`Feature ${feature}`, markers);
  }
  const requireInput = (label, marker) => {
    if (!normalized.some((path) => path.includes(marker))) {
      throw new Error(`${label} is selected but ${marker} is absent from the bundle graph.`);
    }
  };
  if (features.has('bip85')) {
    for (const marker of ['/bip85-feature.ts', '/bip85-child-wallet-feature.ts', '/bip85-deriver.ts'])
      requireInput('Feature bip85', marker);
  }
  if (features.has('silent-payments')) {
    requireInput('Feature silent-payments', '/silent-payment-feature.ts');
    requireInput('Feature silent-payments', '/silent-payment.ts');
  }
  if (features.has('bip38-encrypt')) requireInput('Feature bip38-encrypt', '/bip38-encryption-feature.ts');
  if (features.has('message-signing')) requireInput('Feature message-signing', '/message-signing-feature.ts');
}
