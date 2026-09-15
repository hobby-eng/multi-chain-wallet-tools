import { resolve } from 'node:path';

const disabled = {
  './bip38-decryptor.js':
    "export async function decryptBip38Key(){ throw new Error('BIP38 decryption is not included in this build.'); }",
  './descriptor.js':
    "export function decodeDescriptor(){ throw new Error('Descriptor decoding is not included in this build.'); }",
  './multisig-wallet.js':
    "const unavailable=()=>{throw new Error('Multisig wallet generation is not included in this build.');}; export const buildConcreteMultisigWallet=unavailable, buildRangedWallet=unavailable; export const branchLabel=unavailable;",
  './policy.js':
    "const unavailable=()=>{throw new Error('Policy Builder is not included in this build.');}; export const buildPolicy=unavailable, policyHex=unavailable;",
  './preimage.js':
    "export function calculatePhrasePreimage(){ throw new Error('Policy preimage tools are not included in this build.'); }",
  './psbt.js':
    "const unavailable=()=>{throw new Error('PSBT decoding is not included in this build.');}; export const describeScript=unavailable, pairName=unavailable, pairSummary=unavailable, parsePsbt=unavailable, parsedTransactionId=unavailable, transactionId=unavailable;",
  './script.js': "export function decodeScript(){ throw new Error('Script decoding is not included in this build.'); }",
  './message-verifier.js':
    "export async function verifySignedMessage(){ throw new Error('Message verification is not included in this build.'); }",
  './signing-commitments.js':
    "export function analyzeInputSigning(){ throw new Error('PSBT decoding is not included in this build.'); }",
  './transaction-display.js':
    "const unavailable=()=>{throw new Error('PSBT transaction display is not included in this build.');}; export const describeOpReturn=unavailable, describePreviousScriptSig=unavailable;",
  './dash-import.js':
    "export function buildDashCoreImport(){ throw new Error('Dash support is not included in this build.'); }",
};

function selectedAliases(root, options) {
  const aliases = new Map();
  const disable = (path) => aliases.set(path, disabled[path]);
  if (!options.has('bip38-decrypt')) disable('./bip38-decryptor.js');
  if (!options.has('descriptor-decoder')) disable('./descriptor.js');
  if (!options.has('policy-builder')) {
    disable('./policy.js');
    disable('./preimage.js');
  }
  if (!options.has('multisig-wallet')) disable('./multisig-wallet.js');
  if (!options.has('message-verification')) disable('./message-verifier.js');
  if (!options.has('psbt-decoder')) {
    disable('./signing-commitments.js');
    disable('./transaction-display.js');
  }
  if (!options.has('psbt-decoder') && !options.has('script-decoder') && !options.has('descriptor-decoder')) {
    disable('./psbt.js');
    disable('./script.js');
  }
  if (!options.hasCoin('dash')) disable('./dash-import.js');
  if (options.has('message-verification')) {
    aliases.set(
      './message-verifier.js',
      options.hasCoin('bitcoin') && options.hasCoin('dash')
        ? resolve(root, 'apps/psbt-inspector/src/message-verifier.ts')
        : options.hasCoin('bitcoin')
          ? resolve(root, 'apps/psbt-inspector/src/message-verifier-bitcoin.ts')
          : resolve(root, 'apps/psbt-inspector/src/message-verifier-dash.ts'),
    );
  }
  return aliases;
}

export function createPsbtCompositionPlugin(root, options, basePlugin) {
  const aliases = selectedAliases(root, options);
  const installers = [];
  const featureImports = [];
  if (options.has('psbt-decoder')) {
    featureImports.push(
      `import { installPsbtDecoderFeature } from ${JSON.stringify(resolve(root, 'apps/psbt-inspector/src/psbt-decoder-feature.ts'))};`,
    );
    installers.push('installPsbtDecoderFeature()');
  }
  if (options.has('script-decoder') || options.has('descriptor-decoder')) {
    featureImports.push(
      `import { installScriptDecoderFeature } from ${JSON.stringify(resolve(root, 'apps/psbt-inspector/src/script-decoder-feature.ts'))};`,
    );
    installers.push(
      `installScriptDecoderFeature({ script: ${options.has('script-decoder')}, descriptor: ${options.has('descriptor-decoder')} })`,
    );
  }
  if (options.has('policy-builder')) {
    featureImports.push(
      `import { installPolicyBuilderFeature } from ${JSON.stringify(resolve(root, 'apps/psbt-inspector/src/policy-builder-feature.ts'))};`,
    );
    installers.push('installPolicyBuilderFeature()');
  }
  if (options.has('multisig-wallet')) {
    featureImports.push(
      `import { installMultisigWalletFeature } from ${JSON.stringify(resolve(root, 'apps/psbt-inspector/src/multisig-wallet-feature.ts'))};`,
    );
    installers.push('installMultisigWalletFeature()');
  }
  if (options.has('message-verification')) {
    featureImports.push(
      `import { installMessageVerificationFeature } from ${JSON.stringify(resolve(root, 'apps/psbt-inspector/src/message-verification-feature.ts'))};`,
    );
    installers.push('installMessageVerificationFeature()');
  }
  if (options.has('bip38-decrypt')) {
    featureImports.push(
      `import { installBip38Feature } from ${JSON.stringify(resolve(root, 'apps/psbt-inspector/src/bip38-feature.ts'))};`,
    );
    installers.push('installBip38Feature()');
  }
  const featureSelection = `${featureImports.join('\n')}\nexport function installSelectedPsbtFeatures(){ ${installers.join('; ')}; }`;
  return {
    name: 'psbt-inspector-composition',
    setup(build) {
      build.onResolve({ filter: /^\.\/feature-selection\.js$/ }, () => ({
        path: 'selected-features',
        namespace: 'ckd-psbt-selection',
      }));
      build.onLoad({ filter: /.*/, namespace: 'ckd-psbt-selection' }, () => ({
        contents: featureSelection,
        loader: 'ts',
        resolveDir: root,
      }));
      build.onResolve(
        {
          filter:
            /^\.\/(?:bip38-decryptor|descriptor|multisig-wallet|policy|preimage|psbt|script|message-verifier|signing-commitments|transaction-display|dash-import)\.js$/,
        },
        ({ path, importer }) => {
          if (!importer.replaceAll('\\', '/').includes('/apps/psbt-inspector/src/')) return undefined;
          const selected = aliases.get(path);
          if (selected === undefined) return undefined;
          return typeof selected === 'string' && selected.startsWith('/')
            ? { path: selected }
            : { path, namespace: 'ckd-disabled-psbt' };
        },
      );
      build.onLoad({ filter: /.*/, namespace: 'ckd-disabled-psbt' }, ({ path }) => ({
        contents: aliases.get(path),
        loader: 'ts',
      }));
      basePlugin?.setup(build);
    },
  };
}

export function applyPsbtCompositionTemplate(template, options) {
  let rendered = template;
  for (const coin of ['bitcoin', 'dash']) {
    if (!options.hasCoin(coin))
      rendered = rendered.replace(new RegExp(`<option value=["']${coin}["'][^>]*>[^<]*<\\/option>`, 'giu'), '');
  }
  const modes = {
    inspector: options.has('psbt-decoder'),
    script: options.has('script-decoder') || options.has('descriptor-decoder'),
    builder: options.has('policy-builder'),
    wallet: options.has('multisig-wallet'),
    verify: options.has('message-verification'),
    bip38: options.has('bip38-decrypt'),
  };
  for (const [mode, included] of Object.entries(modes)) {
    if (!included)
      rendered = rendered.replace(new RegExp(`<button[^>]*data-mode=["']${mode}["'][\\s\\S]*?<\\/button>`, 'iu'), '');
  }
  const fragments = {
    'psbt-decoder': options.has('psbt-decoder'),
    'script-tools': options.has('script-decoder') || options.has('descriptor-decoder'),
    'policy-builder': options.has('policy-builder'),
    'multisig-wallet': options.has('multisig-wallet'),
    'message-verification': options.has('message-verification'),
    'bip38-decrypt': options.has('bip38-decrypt'),
  };
  for (const [feature, included] of Object.entries(fragments)) {
    const start = `<!-- ckd-feature:${feature}:start -->`;
    const end = `<!-- ckd-feature:${feature}:end -->`;
    const block = new RegExp(`\\s*${start}[\\s\\S]*?${end}`, 'u');
    rendered = included ? rendered.replaceAll(start, '').replaceAll(end, '') : rendered.replace(block, '');
  }
  return rendered;
}

export function assertPsbtComposition(options, inputs) {
  const normalized = inputs.map((input) => input.replaceAll('\\\\', '/'));
  const markers = {
    'psbt-decoder': ['/psbt-decoder-feature.ts', '/signing-commitments.ts', '/transaction-display.ts'],
    'script-decoder': ['/script-decoder-feature.ts'],
    'bip38-decrypt': ['/bip38-decryptor.ts', '/crypto-core/src/bip38.ts'],
    'descriptor-decoder': ['/psbt-inspector/src/descriptor.ts'],
    'policy-builder': ['/psbt-inspector/src/policy.ts', '/psbt-inspector/src/preimage.ts'],
    'multisig-wallet': ['/psbt-inspector/src/multisig-wallet.ts'],
    'message-verification': ['/message-verifier-bitcoin.ts', '/message-verifier-dash.ts', '/message-verifier.ts'],
  };
  for (const [feature, forbidden] of Object.entries(markers)) {
    if (options.has(feature) || (feature === 'script-decoder' && options.has('descriptor-decoder'))) continue;
    const leaked = normalized.filter((input) => forbidden.some((marker) => input.includes(marker)));
    if (leaked.length)
      throw new Error(`PSBT Inspector excluded ${feature}, but its modules remain:\n${leaked.join('\n')}`);
  }
  if (!options.hasCoin('bitcoin')) {
    const leaked = normalized.filter(
      (input) => input.includes('/bip322-verifier.ts') || input.includes('/message-verifier-bitcoin.ts'),
    );
    if (leaked.length)
      throw new Error(`Dash-only PSBT Inspector contains Bitcoin verifier modules:\n${leaked.join('\n')}`);
  }
  if (!options.hasCoin('dash')) {
    const leaked = normalized.filter(
      (input) => input.includes('/dash-message-verifier.ts') || input.includes('/message-verifier-dash.ts'),
    );
    if (leaked.length)
      throw new Error(`Bitcoin-only PSBT Inspector contains Dash verifier modules:\n${leaked.join('\n')}`);
  }
  const requireInput = (feature, marker) => {
    if (!normalized.some((input) => input.includes(marker)))
      throw new Error(`PSBT Inspector selected ${feature}, but ${marker} is absent from the bundle graph.`);
  };
  const requiredFeatureModules = {
    'psbt-decoder': ['/psbt-decoder-feature.ts', '/psbt.ts', '/signing-commitments.ts', '/transaction-display.ts'],
    'policy-builder': ['/policy-builder-feature.ts', '/policy.ts', '/preimage.ts'],
    'multisig-wallet': ['/multisig-wallet-feature.ts', '/multisig-wallet.ts'],
    'message-verification': ['/message-verification-feature.ts'],
    'bip38-decrypt': ['/bip38-feature.ts', '/bip38-decryptor.ts'],
  };
  for (const [feature, markers] of Object.entries(requiredFeatureModules)) {
    if (options.has(feature)) for (const marker of markers) requireInput(feature, marker);
  }
  if (options.has('script-decoder') || options.has('descriptor-decoder'))
    requireInput('script/descriptor tools', '/script-decoder-feature.ts');
  if (options.has('script-decoder')) requireInput('script-decoder', '/script.ts');
  if (options.has('descriptor-decoder')) requireInput('descriptor-decoder', '/descriptor.ts');
}
