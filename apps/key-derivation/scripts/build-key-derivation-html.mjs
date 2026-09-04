import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, transform } from 'esbuild';
import { createBuildInfo } from '../../../tooling/build-metadata.mjs';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const scriptCsp = (javascript) => `'sha256-${createHash('sha256').update(javascript).digest('base64')}'`;
const template = readFileSync(resolve(root, 'apps/key-derivation/src/index.html'), 'utf8');
const cssSource = readFileSync(resolve(root, 'packages/shared-ui/styles/main.css'), 'utf8');
const css = (await transform(cssSource, { loader: 'css', minify: true, legalComments: 'inline' })).code;
const workerBuild = await build({
  absWorkingDir: root,
  entryPoints: ['apps/key-derivation/src/workers/derive-worker.ts'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome120', 'firefox120', 'safari17'],
  treeShaking: true,
  minify: true,
  legalComments: 'inline',
  loader: { '.wasm': 'binary' },
  write: false,
});
const workerSource = workerBuild.outputFiles[0]?.text;
if (workerSource === undefined) throw new Error('esbuild did not produce a derivation worker bundle.');
if (!/postMessage\(\{type:"ready"\}\)/u.test(workerSource)) {
  throw new Error('Derivation worker bundle is missing its explicit ready handshake.');
}
const buildInfo = createBuildInfo(root, 'Wallet_Key_Derivation_Tool.html.sha256');
const bundled = await build({
  absWorkingDir: root,
  entryPoints: ['apps/key-derivation/src/ui/app.ts'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome120', 'firefox120', 'safari17'],
  treeShaking: true,
  minify: true,
  legalComments: 'inline',
  loader: { '.wasm': 'binary' },
  define: {
    __BUILD_INFO__: JSON.stringify(buildInfo),
    __DERIVATION_WORKER_SOURCE__: JSON.stringify(workerSource),
  },
  write: false,
});
const javascript = bundled.outputFiles[0]?.text;
if (javascript === undefined) throw new Error('esbuild did not produce a JavaScript bundle.');
if (!javascript.includes('wallet-key-derivation') || !javascript.includes('The derivation worker stopped unexpectedly.')) {
  throw new Error('Derivation worker client lost its reviewed startup/error lifecycle.');
}
if (
  !template.includes('/*__INLINE_CSS__*/')
  || !template.includes('/*__INLINE_JS__*/')
  || !template.includes('__INLINE_SCRIPT_CSP__')
) {
  throw new Error('HTML template is missing an inline build marker.');
}
const safeJavascript = javascript.replaceAll('</script', '<\\/script');
const html = template
  // Callback replacements keep `$&`, `$\``, and `$'` sequences inside bundled
  // code literal. Passing bundle text as the replacement argument would make
  // String.replace interpret those sequences and can duplicate the template.
  .replace('__INLINE_SCRIPT_CSP__', scriptCsp(safeJavascript))
  .replace('/*__INLINE_CSS__*/', () => css)
  .replace('/*__INLINE_JS__*/', () => safeJavascript);
const dist = resolve(root, 'dist/key-derivation');
mkdirSync(dist, { recursive: true });
const artifact = resolve(dist, 'Wallet_Key_Derivation_Tool.html');
writeFileSync(artifact, html);
const checksum = createHash('sha256').update(html).digest('hex');
writeFileSync(resolve(dist, 'Wallet_Key_Derivation_Tool.html.sha256'), `${checksum}  Wallet_Key_Derivation_Tool.html\n`);
console.log(`Built dist/key-derivation/Wallet_Key_Derivation_Tool.html (${Buffer.byteLength(html).toLocaleString()} bytes)`);
console.log(`SHA-256 ${checksum}`);
