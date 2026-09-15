import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, transform } from 'esbuild';
import { createBuildInfo } from '../../../tooling/build-metadata.mjs';
import {
  assertKeyDerivationComposition,
  createKeyDerivationCompositionPlugin,
  selectedUiEntry,
  selectedWorkerEntry,
} from '../../../tooling/key-derivation-composition.mjs';
import {
  applyKeyDerivationFeatureTemplate,
  customKeyDerivationArtifact,
  describeCustomArtifact,
  featureDefines,
  parseKeyDerivationFeatures,
  parseOutputPath,
} from '../../../tooling/key-derivation-features.mjs';
import {
  applyProfileTemplate,
  assertDashOnlyGraph,
  getToolBuild,
  parseBuildProfile,
} from '../../../tooling/build-profiles.mjs';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const profile = parseBuildProfile();
const tool = getToolBuild(profile, 'key-derivation');
const features = parseKeyDerivationFeatures(profile);
const featureProfile = {
  ...profile,
  capabilities: {
    ...profile.capabilities,
    bip85: features.has('bip85'),
    bitcoinSilentPayments: features.has('silent-payments'),
    bitcoinMessageSigning: profile.capabilities.bitcoinMessageSigning && features.hasCoin('bitcoin'),
  },
};
const customArtifact = customKeyDerivationArtifact(root, profile, features, parseOutputPath());
const scriptCsp = (javascript) => `'sha256-${createHash('sha256').update(javascript).digest('base64')}'`;
const template = applyProfileTemplate(
  readFileSync(resolve(root, 'apps/key-derivation/src/index.html'), 'utf8'),
  featureProfile,
  tool,
);
const featuredTemplate = applyKeyDerivationFeatureTemplate(template, features);
const cssSource = readFileSync(resolve(root, 'packages/shared-ui/styles/main.css'), 'utf8');
const shellCss = readFileSync(resolve(root, 'packages/shared-ui/styles/tool-shell.css'), 'utf8');
const themeCss =
  profile.themeStylesheet === undefined ? '' : readFileSync(resolve(root, profile.themeStylesheet), 'utf8');
const css = (
  await transform(`${cssSource}\n${shellCss}\n${themeCss}`, { loader: 'css', minify: true, legalComments: 'inline' })
).code;
const workerBuild = await build({
  absWorkingDir: root,
  stdin: { contents: selectedWorkerEntry(root, profile, features), loader: 'ts', resolveDir: root },
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome120', 'firefox120', 'safari17'],
  treeShaking: true,
  minify: true,
  legalComments: 'inline',
  loader: { '.wasm': 'binary' },
  plugins: [
    createKeyDerivationCompositionPlugin(root, features),
    ...(features.hasCoin('bitcoin')
      ? [
          {
            name: 'embedded-btcutil-wasm',
            setup(buildContext) {
              buildContext.onResolve({ filter: /^btcutil-js-wasm$/ }, () => ({
                path: 'btcutil-js-wasm',
                namespace: 'btcutil-wasm',
              }));
              buildContext.onLoad({ filter: /.*/, namespace: 'btcutil-wasm' }, () => ({
                contents: readFileSync(resolve(root, 'node_modules/btcutil-js/dist/btcutil.wasm')),
                loader: 'binary',
              }));
              buildContext.onLoad({ filter: /node_modules\/btcutil-js\/dist\/index\.js$/ }, ({ path }) => ({
                contents: `const __offlineFetch = () => Promise.reject(new Error('Network access is unavailable in the offline browser artifact.'));\n${readFileSync(
                  path,
                  'utf8',
                )
                  .replaceAll(
                    'new Function("m", "return import(m)")',
                    '((moduleName) => Promise.reject(new Error(`Node-only module ${moduleName} is unavailable in the offline browser artifact.`)))',
                  )
                  .replaceAll('fetch(', '__offlineFetch(')}`,
                loader: 'js',
              }));
            },
          },
        ]
      : []),
  ],
  metafile: true,
  write: false,
});
const workerSource = workerBuild.outputFiles[0]?.text;
if (workerSource === undefined) throw new Error('esbuild did not produce a derivation worker bundle.');
if (!/postMessage\(\{type:"ready"\}\)/u.test(workerSource)) {
  throw new Error('Derivation worker bundle is missing its explicit ready handshake.');
}
const buildInfo = createBuildInfo(root, tool.checksumFile, profile, {
  coins: features.coins,
  features: features.selected,
});
const bundled = await build({
  absWorkingDir: root,
  stdin: { contents: selectedUiEntry(root), loader: 'ts', resolveDir: root },
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome120', 'firefox120', 'safari17'],
  treeShaking: true,
  minify: true,
  legalComments: 'inline',
  loader: { '.wasm': 'binary' },
  metafile: true,
  plugins: [
    createKeyDerivationCompositionPlugin(root, features),
    {
      name: 'selected-recovery-features',
      setup(buildContext) {
        buildContext.onResolve({ filter: /derivation-feature-selection\.js$/ }, () => ({
          path: 'derivation-selection',
          namespace: 'ckd-derivation-selection',
        }));
        buildContext.onLoad({ filter: /.*/, namespace: 'ckd-derivation-selection' }, () => {
          const definitions = [
            ['bip85', 'bip85-feature.ts', 'installBip85Feature'],
            ['silent-payments', 'silent-payment-feature.ts', 'installSilentPaymentFeature'],
          ].filter(([feature]) => features.has(feature));
          const exports = definitions
            .map(
              ([, file, symbol]) =>
                `export { ${symbol} } from ${JSON.stringify(resolve(root, 'apps/key-derivation/src/ui', file))};`,
            )
            .join('\n');
          let bip38 = '';
          if (features.has('bip38-encrypt')) {
            const supportedResultIds = [
              ...(features.hasCoin('bitcoin') ? ['bitcoin-legacy'] : []),
              ...(features.hasCoin('dash') ? ['dash-core', 'dash-legacy-mobile', 'dash-core-coinjoin'] : []),
            ];
            bip38 = `import { createBip38EncryptionInstaller } from ${JSON.stringify(resolve(root, 'apps/key-derivation/src/ui/bip38-encryption-feature.ts'))};
export const installBip38EncryptionFeature = createBip38EncryptionInstaller(${JSON.stringify(supportedResultIds)});`;
          }
          let signing = '';
          if (features.has('message-signing')) {
            const policyImports = [];
            const policies = [];
            if (features.hasCoin('bitcoin')) {
              policyImports.push(
                `import { BITCOIN_MESSAGE_SIGNING_POLICY } from ${JSON.stringify(resolve(root, 'apps/key-derivation/src/ui/message-signing-policy-bitcoin.ts'))};`,
              );
              policies.push('BITCOIN_MESSAGE_SIGNING_POLICY');
            }
            if (features.hasCoin('dash')) {
              policyImports.push(
                `import { DASH_MESSAGE_SIGNING_POLICY } from ${JSON.stringify(resolve(root, 'apps/key-derivation/src/ui/message-signing-policy-dash.ts'))};`,
              );
              policies.push('DASH_MESSAGE_SIGNING_POLICY');
            }
            signing = `import { createMessageSigningInstaller } from ${JSON.stringify(resolve(root, 'apps/key-derivation/src/ui/message-signing-feature.ts'))};
${policyImports.join('\n')}
${policies.length > 1 ? `import { combineMessageSigningPolicies } from ${JSON.stringify(resolve(root, 'apps/key-derivation/src/ui/message-signing-policy.ts'))};` : ''}
export const installMessageSigningFeature = createMessageSigningInstaller(${policies.length > 1 ? `combineMessageSigningPolicies(${policies.join(', ')})` : policies[0]});`;
          }
          return {
            loader: 'ts',
            resolveDir: root,
            contents: `${exports}\n${bip38}\n${signing}`,
          };
        });
        buildContext.onResolve({ filter: /recovery-feature-selection\.js$/ }, () => ({
          path: 'selection',
          namespace: 'ckd-recovery-selection',
        }));
        buildContext.onLoad({ filter: /.*/, namespace: 'ckd-recovery-selection' }, () => {
          const definitions = [
            ['wallet-matcher', 'matcher', 'recovery-wallet-matcher.ts', 'installWalletMatcher'],
            ['seedqr', 'seedqr', 'recovery-seedqr.ts', 'installSeedQr'],
            ['slip39', 'slip39', 'recovery-slip39.ts', 'installSlip39'],
            ['shamir', 'shamir-raw,shamir-words', 'recovery-shamir.ts', 'installShamir'],
            ['codex32', 'codex32', 'recovery-codex32.ts', 'installCodex32'],
          ].filter(([feature]) => features.has(feature));
          const imports = definitions
            .map(
              ([, , file, symbol], index) =>
                `import { ${symbol} as install${index} } from ${JSON.stringify(resolve(root, 'apps/key-derivation/src/ui', file))};`,
            )
            .join('\n');
          const targets = definitions.flatMap(([, values]) => values.split(','));
          const calls = definitions.map((_, index) => `install${index}(context);`).join('\n');
          return {
            loader: 'ts',
            resolveDir: root,
            contents: `${imports}\nexport const selectedRecoveryTargets = new Set(${JSON.stringify(targets)});\nexport function installSelectedRecoveryFeatures(context) { ${calls} }`,
          };
        });
      },
    },
  ],
  define: {
    ...featureDefines(features),
    __BUILD_INFO__: JSON.stringify(buildInfo),
    __DERIVATION_WORKER_SOURCE__: JSON.stringify(workerSource),
    __DASH_COMMUNITY__: profile.id === 'dash-community' ? 'true' : 'false',
  },
  write: false,
});
assertKeyDerivationComposition(features, [
  ...Object.keys(workerBuild.metafile.inputs),
  ...Object.keys(bundled.metafile.inputs),
]);
const javascript = bundled.outputFiles[0]?.text;
if (javascript === undefined) throw new Error('esbuild did not produce a JavaScript bundle.');
if (profile.id === 'dash-community') {
  assertDashOnlyGraph(
    [...Object.keys(workerBuild.metafile.inputs), ...Object.keys(bundled.metafile.inputs)],
    'Dash Community key derivation',
  );
}
if (
  !javascript.includes('wallet-key-derivation') ||
  !javascript.includes('The derivation worker stopped unexpectedly.')
) {
  throw new Error('Derivation worker client lost its reviewed startup/error lifecycle.');
}
if (
  !featuredTemplate.includes('/*__INLINE_CSS__*/') ||
  !template.includes('/*__INLINE_JS__*/') ||
  !template.includes('__INLINE_SCRIPT_CSP__')
) {
  throw new Error('HTML template is missing an inline build marker.');
}
const safeJavascript = javascript.replaceAll('</script', '<\\/script');
// Callback replacements keep '$&', '$`', and '$'' sequences inside bundled
// code literal. Passing bundle text as the replacement argument would make
// String.replace interpret those sequences and can duplicate the template.
let html = featuredTemplate
  .replace('__INLINE_SCRIPT_CSP__', '__INLINE_SCRIPT_CSP_HASH__')
  .replace('/*__INLINE_CSS__*/', () => css)
  .replace('/*__INLINE_JS__*/', () => safeJavascript);
const scriptStart = html.indexOf('<script>');
const scriptEnd = html.lastIndexOf('</script>');
if (scriptStart < 0 || scriptEnd <= scriptStart)
  throw new Error('Generated HTML did not contain the inline application script.');
// CSP authorizes the exact bytes the browser will execute, including template whitespace.
const inlineScript = html.slice(scriptStart + '<script>'.length, scriptEnd);
html = html.replace('__INLINE_SCRIPT_CSP_HASH__', scriptCsp(inlineScript));
const artifact = customArtifact ?? resolve(root, 'dist', tool.artifactDirectory, tool.artifactName);
const dist = resolve(artifact, '..');
mkdirSync(dist, { recursive: true });
writeFileSync(artifact, html);
const checksum = createHash('sha256').update(html).digest('hex');
writeFileSync(`${artifact}.sha256`, `${checksum}  ${describeCustomArtifact(artifact)}\n`);
console.log(
  `Built ${customArtifact === undefined ? `dist/${tool.artifactRelativePath}` : artifact} (${Buffer.byteLength(html).toLocaleString()} bytes)`,
);
console.log(`SHA-256 ${checksum}`);
