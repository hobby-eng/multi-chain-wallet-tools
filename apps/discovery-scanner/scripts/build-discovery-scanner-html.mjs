import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, transform } from 'esbuild';
import { createBuildInfo } from '../../../tooling/build-metadata.mjs';
import { verifyDashSdkBuild } from '../../../tooling/verify-dash-sdk-build.mjs';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
verifyDashSdkBuild(root, 'The Wallet Discovery Scanner');

const vaultTemplate = readFileSync(resolve(root, 'apps/discovery-scanner/src/index.html'), 'utf8');
const shellTemplate = readFileSync(resolve(root, 'apps/discovery-scanner/src/shell.html'), 'utf8');
const sharedCss = readFileSync(resolve(root, 'packages/shared-ui/styles/main.css'), 'utf8');
const recoveryCss = readFileSync(resolve(root, 'apps/discovery-scanner/src/styles.css'), 'utf8');
const css = (await transform(`${sharedCss}\n${recoveryCss}`, {
  loader: 'css',
  minify: true,
  legalComments: 'inline',
})).code;
const buildInfo = createBuildInfo(root, 'Wallet_Discovery_Scanner.html.sha256');
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
const vaultBundle = await build({
  absWorkingDir: root,
  entryPoints: ['apps/discovery-scanner/src/app.ts'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome120', 'firefox120', 'safari17'],
  treeShaking: true,
  minify: true,
  legalComments: 'inline',
  loader: { '.wasm': 'binary' },
  define: { __BUILD_INFO__: JSON.stringify(buildInfo) },
  metafile: true,
  write: false,
});
const vaultJavascript = vaultBundle.outputFiles[0]?.text;
if (vaultJavascript === undefined) throw new Error('esbuild did not produce the Recovery Secret Vault bundle.');
const vaultInputs = Object.keys(vaultBundle.metafile.inputs);
if (vaultInputs.some((input) => input.includes('@dashevo/evo-sdk') || input.endsWith('/network-service.ts') || input.endsWith('/network-worker.ts'))) {
  throw new Error('Recovery Secret Vault bundle unexpectedly contains the network SDK/service.');
}
if (vaultInputs.some((input) => input.endsWith('/packages/export-core/src/download.ts'))) {
  throw new Error('Recovery Secret Vault bundle unexpectedly contains direct browser download capability.');
}
if (!vaultTemplate.includes('/*__INLINE_CSS__*/') || !vaultTemplate.includes('/*__INLINE_JS__*/') || !vaultTemplate.includes('__VAULT_SCRIPT_CSP__')) {
  throw new Error('Recovery Secret Vault template is missing an inline build marker.');
}
const safeVaultJavascript = vaultJavascript.replaceAll('</script', '<\\/script');
const vaultHtml = vaultTemplate
  .replace('__VAULT_SCRIPT_CSP__', scriptCsp(safeVaultJavascript))
  .replace('/*__INLINE_CSS__*/', () => css)
  .replace('/*__INLINE_JS__*/', () => safeVaultJavascript);

const networkBundle = await build({
  absWorkingDir: root,
  entryPoints: ['apps/discovery-scanner/src/network-worker.ts'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome120', 'firefox120', 'safari17'],
  treeShaking: true,
  minify: true,
  legalComments: 'inline',
  loader: { '.wasm': 'binary' },
  metafile: true,
  write: false,
});
const networkJavascript = networkBundle.outputFiles[0]?.text;
if (networkJavascript === undefined) throw new Error('esbuild did not produce the Recovery Network Worker bundle.');
const networkInputs = Object.keys(networkBundle.metafile.inputs);
if (!networkInputs.some((input) => input.includes('@dashevo/evo-sdk'))) {
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
if (
  networkDynamicCode.functionConstructors !== 3
  || networkDynamicCode.newFunctionConstructors !== 2
  || networkDynamicCode.knownDiagnosticLiterals !== 1
  || networkDynamicCode.evalCalls !== 0
  || !networkJavascript.includes('return import("node:zlib")')
) {
  throw new Error('Recovery Network Worker dynamic-code surface changed from the two reviewed SDK glue paths.');
}
const vaultDynamicCode = dynamicCodeSurface(vaultJavascript);
if (vaultDynamicCode.functionConstructors !== 0 || vaultDynamicCode.evalCalls !== 0) {
  throw new Error('Recovery Secret Vault bundle unexpectedly contains dynamic code evaluation.');
}

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
  'apps/discovery-scanner/src/network-protocol.ts',
]);
const unexpectedShellInputs = Object.keys(shellBundle.metafile.inputs)
  .filter((input) => !allowedShellInputs.has(input));
if (unexpectedShellInputs.length > 0) {
  throw new Error(`Recovery shell bundle crossed its two-module boundary through: ${unexpectedShellInputs.join(', ')}`);
}
for (const input of allowedShellInputs) {
  const source = readFileSync(resolve(root, input), 'utf8');
  const surface = dynamicCodeSurface(source);
  if (surface.functionConstructors !== 0 || surface.evalCalls !== 0) {
    throw new Error(`Recovery shell source unexpectedly contains dynamic code evaluation in ${input}.`);
  }
}
if (!shellTemplate.includes('/*__SHELL_JS__*/') || !shellTemplate.includes('__SHELL_SCRIPT_CSP__') || !shellTemplate.includes('__VAULT_SCRIPT_CSP__')) {
  throw new Error('Recovery shell template is missing an inline build marker.');
}
const safeShellJavascript = shellJavascript.replaceAll('</script', '<\\/script');
const html = shellTemplate
  .replace('__SHELL_SCRIPT_CSP__', scriptCsp(safeShellJavascript))
  // A srcdoc document inherits the embedding document's CSP in addition to
  // enforcing its own. Both policies therefore authorize the exact vault
  // script hash; the vault's own connect-src remains the stricter 'none'.
  .replace('__VAULT_SCRIPT_CSP__', scriptCsp(safeVaultJavascript))
  .replace('/*__SHELL_JS__*/', () => safeShellJavascript);
const dist = resolve(root, 'dist/discovery-scanner');
mkdirSync(dist, { recursive: true });
const artifact = resolve(dist, 'Wallet_Discovery_Scanner.html');
writeFileSync(artifact, html);
const checksum = createHash('sha256').update(html).digest('hex');
writeFileSync(resolve(dist, 'Wallet_Discovery_Scanner.html.sha256'), `${checksum}  Wallet_Discovery_Scanner.html\n`);
console.log(`Built dist/discovery-scanner/Wallet_Discovery_Scanner.html (${Buffer.byteLength(html).toLocaleString()} bytes)`);
console.log(`SHA-256 ${checksum}`);
