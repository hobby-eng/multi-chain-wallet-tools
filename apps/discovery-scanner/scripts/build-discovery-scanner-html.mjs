import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, transform } from 'esbuild';
import { createBuildInfo } from '../../../tooling/build-metadata.mjs';
import {
  assertDiscoveryComposition,
  createDiscoveryCompositionPlugin,
  discoveryAppEntry,
  discoveryNetworkWorkerEntry,
} from '../../../tooling/discovery-composition.mjs';
import {
  artifactDisplayName,
  customToolArtifact,
  parseRequestedOutput,
  parseToolFeatureOptions,
} from '../../../tooling/tool-feature-options.mjs';
import {
  applyProfileTemplate,
  assertDashOnlyGraph,
  getToolBuild,
  parseBuildProfile,
} from '../../../tooling/build-profiles.mjs';
import { verifyDashSdkBuild } from '../../../tooling/verify-dash-sdk-build.mjs';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const profile = parseBuildProfile();
const tool = getToolBuild(profile, 'discovery-scanner');
const options = parseToolFeatureOptions('discovery-scanner', profile);
const customArtifact = customToolArtifact(root, profile, 'discovery-scanner', tool, options, parseRequestedOutput());
if (options.hasCoin('dash')) verifyDashSdkBuild(root, 'The Wallet Discovery Scanner');

let vaultTemplate = applyProfileTemplate(
  readFileSync(resolve(root, 'apps/discovery-scanner/src/index.html'), 'utf8'),
  profile,
  tool,
);
let shellTemplate = applyProfileTemplate(
  readFileSync(resolve(root, 'apps/discovery-scanner/src/shell.html'), 'utf8'),
  profile,
  tool,
);
if (!options.has('seed-discovery')) {
  vaultTemplate = vaultTemplate
    .replaceAll('Secret Vault', 'Public Input Boundary')
    .replaceAll('secret candidates', 'public inputs');
  shellTemplate = shellTemplate.replaceAll('Secret Vault', 'Public Input Boundary');
}
const sharedCss = readFileSync(resolve(root, 'packages/shared-ui/styles/main.css'), 'utf8');
const recoveryCss = readFileSync(resolve(root, 'apps/discovery-scanner/src/styles.css'), 'utf8');
const shellCss = readFileSync(resolve(root, 'packages/shared-ui/styles/tool-shell.css'), 'utf8');
const themeCss =
  profile.themeStylesheet === undefined ? '' : readFileSync(resolve(root, profile.themeStylesheet), 'utf8');
const css = (
  await transform(`${sharedCss}\n${recoveryCss}\n${shellCss}\n${themeCss}`, {
    loader: 'css',
    minify: true,
    legalComments: 'inline',
  })
).code;
const buildInfo = createBuildInfo(root, tool.checksumFile, profile, {
  coins: options.coins,
  features: options.selected,
});
const scriptCsp = (javascript) => `'sha256-${createHash('sha256').update(javascript).digest('base64')}'`;
function dynamicCodeSurface(javascript) {
  // TypeScript 7 deliberately removed its stable in-process parser API. Use
  // a fail-closed lexical surface instead: it includes strings/comments, so a
  // harmless new textual occurrence also stops the release, but a real plain
  // `Function(...)`, `new Function(...)`, or `eval(...)` cannot be missed.
  return {
    functionConstructors: (javascript.match(/(?:^|[^.\w])(?:new\s+)?Function\s*\(/gu) ?? []).length,
    newFunctionConstructors: (javascript.match(/(?:^|[^.\w])new\s+Function\s*\(/gu) ?? []).length,
    evalCalls: (javascript.match(/(?:^|[^.\w])eval\s*\(/gu) ?? []).length,
    knownDiagnosticLiterals: javascript.split('Function(${o})').length - 1,
  };
}
const networkBundle = await build({
  absWorkingDir: root,
  stdin: { contents: discoveryNetworkWorkerEntry(root), loader: 'ts', resolveDir: root },
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome120', 'firefox120', 'safari17'],
  treeShaking: true,
  minify: true,
  legalComments: 'inline',
  loader: { '.wasm': 'binary' },
  plugins: [createDiscoveryCompositionPlugin(root, options)],
  define: { __DASH_COMMUNITY__: JSON.stringify(profile.id === 'dash-community') },
  metafile: true,
  write: false,
});
const networkJavascript = networkBundle.outputFiles[0]?.text;
if (networkJavascript === undefined) throw new Error('esbuild did not produce the Recovery Network Worker bundle.');
const networkInputs = Object.keys(networkBundle.metafile.inputs);
if (options.hasCoin('dash') && !networkInputs.some((input) => input.includes('@dashevo/evo-sdk'))) {
  throw new Error('Recovery Network Worker bundle omitted the pinned Evo SDK.');
}
for (const forbidden of [
  '/app.ts',
  '/secret-guard.ts',
  '/crypto-core/src/bip39.ts',
  '/crypto-core/src/bip32.ts',
  '/crypto-core/src/secrets.ts',
  '/coin-protocols/src/coins/dash/shielded.ts',
  '/orchard-scanner.ts',
]) {
  if (networkInputs.some((input) => input.endsWith(forbidden))) {
    throw new Error(`Recovery Network Worker bundle crossed the secret boundary through ${forbidden}.`);
  }
}
// wasm-bindgen/Evo currently contributes two dynamic-code constructors. The
// outer CSP deliberately omits 'unsafe-eval', so these browser-inactive glue
// paths cannot execute. Pin their exact reviewed count so a dependency update
// cannot silently add another dynamic-code path.
const networkDynamicCode = dynamicCodeSurface(networkJavascript);
if (options.hasCoin('dash')) {
  if (
    networkDynamicCode.functionConstructors !== 3 ||
    networkDynamicCode.newFunctionConstructors !== 2 ||
    networkDynamicCode.knownDiagnosticLiterals !== 1 ||
    networkDynamicCode.evalCalls !== 0 ||
    !networkJavascript.includes('return import("node:zlib")')
  ) {
    throw new Error('Recovery Network Worker dynamic-code surface changed from the two reviewed SDK glue paths.');
  }
} else if (networkDynamicCode.functionConstructors !== 0 || networkDynamicCode.evalCalls !== 0) {
  throw new Error('Recovery Network Worker unexpectedly contains dynamic code evaluation.');
}

const vaultBundle = await build({
  absWorkingDir: root,
  stdin: { contents: discoveryAppEntry(root, options), loader: 'ts', resolveDir: root },
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome120', 'firefox120', 'safari17'],
  treeShaking: true,
  minify: true,
  legalComments: 'inline',
  loader: { '.wasm': 'binary' },
  plugins: [createDiscoveryCompositionPlugin(root, options)],
  define: {
    __RECOVERY_NETWORK_WORKER_JS__: JSON.stringify(networkJavascript),
    __BUILD_INFO__: JSON.stringify(buildInfo),
    __DASH_COMMUNITY__: JSON.stringify(profile.id === 'dash-community'),
  },
  metafile: true,
  write: false,
});
const vaultJavascript = vaultBundle.outputFiles[0]?.text;
if (vaultJavascript === undefined) throw new Error('esbuild did not produce the Recovery Secret Vault bundle.');
const vaultInputs = Object.keys(vaultBundle.metafile.inputs);
if (profile.id === 'dash-community') {
  assertDashOnlyGraph(vaultInputs, 'Dash Community Recovery Secret Vault');
}
if (
  vaultInputs.some(
    (input) =>
      input.includes('@dashevo/evo-sdk') ||
      input.endsWith('/network-service.ts') ||
      input.endsWith('/network-worker.ts'),
  )
) {
  throw new Error('Recovery Secret Vault bundle unexpectedly contains the network SDK/service.');
}
if (vaultInputs.some((input) => input.endsWith('/packages/export-core/src/download.ts'))) {
  throw new Error('Recovery Secret Vault bundle unexpectedly contains direct browser download capability.');
}
if (
  !vaultTemplate.includes('/*__INLINE_CSS__*/') ||
  !vaultTemplate.includes('/*__INLINE_JS__*/') ||
  !vaultTemplate.includes('__VAULT_SCRIPT_CSP__')
) {
  throw new Error('Recovery Secret Vault template is missing an inline build marker.');
}
const safeVaultJavascript = vaultJavascript.replaceAll('</script', '<\/script');
let vaultHtml = vaultTemplate
  .replace('__VAULT_SCRIPT_CSP__', '__VAULT_INLINE_SCRIPT_HASH__')
  .replace('/*__INLINE_CSS__*/', () => css)
  .replace('/*__INLINE_JS__*/', () => safeVaultJavascript);
const vaultScriptStart = vaultHtml.indexOf('<script>');
const vaultScriptEnd = vaultHtml.lastIndexOf('</script>');
if (vaultScriptStart < 0 || vaultScriptEnd <= vaultScriptStart)
  throw new Error('Recovery Secret Vault HTML did not contain the generated inline script.');
// Hash the final embedded bytes, including whitespace introduced by the HTML template.
const vaultInlineScript = vaultHtml.slice(vaultScriptStart + '<script>'.length, vaultScriptEnd);
vaultHtml = vaultHtml.replace('__VAULT_INLINE_SCRIPT_HASH__', scriptCsp(vaultInlineScript));

const vaultDynamicCode = dynamicCodeSurface(vaultJavascript);
if (vaultDynamicCode.functionConstructors !== 0 || vaultDynamicCode.evalCalls !== 0) {
  throw new Error('Recovery Secret Vault bundle unexpectedly contains dynamic code evaluation.');
}

const selectedBoundaryPlugin = {
  name: 'selected-discovery-boundary',
  setup(buildContext) {
    buildContext.onResolve({ filter: /selected-boundary-bootstrap\.js$/ }, () => ({
      path: 'selected-boundary-bootstrap',
      namespace: 'ckd-boundary-selection',
    }));
    buildContext.onLoad({ filter: /.*/, namespace: 'ckd-boundary-selection' }, () => ({
      loader: 'ts',
      resolveDir: root,
      contents: options.has('seed-discovery')
        ? `export { bootstrapVaultDocument as bootstrapSelectedBoundary } from ${JSON.stringify(resolve(root, 'packages/secret-vault/src/worker-bootstrap.ts'))};`
        : `export { bootstrapIsolatedBoundary as bootstrapSelectedBoundary } from ${JSON.stringify(resolve(root, 'packages/network-boundary/src/iframe-bootstrap.ts'))};`,
    }));
  },
};
const shellBundle = await build({
  absWorkingDir: root,
  entryPoints: ['apps/discovery-scanner/src/shell.ts'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome120', 'firefox120', 'safari17'],
  treeShaking: true,
  minify: true,
  legalComments: 'inline',
  plugins: [selectedBoundaryPlugin],
  define: {
    __RECOVERY_VAULT_HTML__: JSON.stringify(vaultHtml),
    __RECOVERY_NETWORK_WORKER_JS__: JSON.stringify(networkJavascript),
  },
  metafile: true,
  write: false,
});
const shellJavascript = shellBundle.outputFiles[0]?.text;
if (shellJavascript === undefined) throw new Error('esbuild did not produce the Recovery isolation shell bundle.');
const allowedShellInputs = new Set([
  'apps/discovery-scanner/src/shell.ts',
  'packages/network-boundary/src/protocol.ts',
  'packages/network-boundary/src/data-types.ts',
  'packages/network-boundary/src/client.ts',
  'packages/network-boundary/src/iframe-bootstrap.ts',
  'ckd-boundary-selection:selected-boundary-bootstrap',
  ...(options.has('seed-discovery') ? ['packages/secret-vault/src/worker-bootstrap.ts'] : []),
]);
const shellInputs = Object.keys(shellBundle.metafile.inputs);
assertDiscoveryComposition(options, [...vaultInputs, ...networkInputs, ...shellInputs]);
const unexpectedShellInputs = shellInputs.filter((input) => !allowedShellInputs.has(input));
if (unexpectedShellInputs.length > 0) {
  throw new Error(`Recovery shell bundle crossed its two-module boundary through: ${unexpectedShellInputs.join(', ')}`);
}
for (const input of allowedShellInputs) {
  // Virtual esbuild modules are generated above from fixed source and have no filesystem path.
  if (input.startsWith('ckd-boundary-selection:')) continue;
  const source = readFileSync(resolve(root, input), 'utf8');
  const surface = dynamicCodeSurface(source);
  if (surface.functionConstructors !== 0 || surface.evalCalls !== 0) {
    throw new Error(`Recovery shell source unexpectedly contains dynamic code evaluation in ${input}.`);
  }
}
if (
  !shellTemplate.includes('/*__SHELL_JS__*/') ||
  !shellTemplate.includes('__SHELL_SCRIPT_CSP__') ||
  !shellTemplate.includes('__VAULT_SCRIPT_CSP__')
) {
  throw new Error('Recovery shell template is missing an inline build marker.');
}
const safeShellJavascript = shellJavascript.replaceAll('</script', '<\/script');
let html = shellTemplate
  .replace('__SHELL_SCRIPT_CSP__', '__SHELL_INLINE_SCRIPT_HASH__')
  // A srcdoc document inherits the embedding document's CSP in addition to
  // enforcing its own. Both policies therefore authorize the exact vault
  // script hash; the vault's own connect-src remains the stricter 'none'.
  .replace('__VAULT_SCRIPT_CSP__', scriptCsp(vaultInlineScript))
  .replace('/*__SHELL_JS__*/', () => safeShellJavascript);
const shellScriptStart = html.indexOf('<script>');
const shellScriptEnd = html.lastIndexOf('</script>');
if (shellScriptStart < 0 || shellScriptEnd <= shellScriptStart)
  throw new Error('Recovery shell HTML did not contain the generated inline script.');
const shellInlineScript = html.slice(shellScriptStart + '<script>'.length, shellScriptEnd);
html = html.replace('__SHELL_INLINE_SCRIPT_HASH__', scriptCsp(shellInlineScript));
const artifact = customArtifact ?? resolve(root, 'dist', tool.artifactDirectory, tool.artifactName);
const dist = resolve(artifact, '..');
mkdirSync(dist, { recursive: true });
writeFileSync(artifact, html);
const checksum = createHash('sha256').update(html).digest('hex');
writeFileSync(`${artifact}.sha256`, `${checksum}  ${artifactDisplayName(artifact)}\n`);
console.log(
  `Built ${customArtifact === undefined ? `dist/${tool.artifactRelativePath}` : artifact} (${Buffer.byteLength(html).toLocaleString()} bytes)`,
);
console.log(`SHA-256 ${checksum}`);
