import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, transform } from 'esbuild';
import { createBuildInfo } from '../../../tooling/build-metadata.mjs';
import { verifyDashSdkBuild } from '../../../tooling/verify-dash-sdk-build.mjs';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
verifyDashSdkBuild(root, 'The viewer');
const template = readFileSync(resolve(root, 'apps/activity-viewer/src/index.html'), 'utf8');
const sharedCss = readFileSync(resolve(root, 'packages/shared-ui/styles/main.css'), 'utf8');
const viewerCss = readFileSync(resolve(root, 'apps/activity-viewer/src/styles.css'), 'utf8');
const css = (await transform(`${sharedCss}\n${viewerCss}`, {
  loader: 'css',
  minify: true,
  legalComments: 'inline',
})).code;
const buildInfo = createBuildInfo(root, 'Wallet_Activity_Viewer.html.sha256');
const bundled = await build({
  absWorkingDir: root,
  entryPoints: ['apps/activity-viewer/src/app.ts'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome120', 'firefox120', 'safari17'],
  treeShaking: true,
  minify: true,
  legalComments: 'inline',
  loader: { '.wasm': 'binary' },
  define: { __BUILD_INFO__: JSON.stringify(buildInfo) },
  write: false,
});
const javascript = bundled.outputFiles[0]?.text;
if (javascript === undefined) throw new Error('esbuild did not produce the viewer JavaScript bundle.');
if (!template.includes('/*__INLINE_CSS__*/') || !template.includes('/*__INLINE_JS__*/')) {
  throw new Error('Viewer HTML template is missing an inline build marker.');
}
const html = template
  .replace('/*__INLINE_CSS__*/', () => css)
  .replace('/*__INLINE_JS__*/', () => javascript.replaceAll('</script', '<\\/script'));
const dist = resolve(root, 'dist/activity-viewer');
mkdirSync(dist, { recursive: true });
const artifact = resolve(dist, 'Wallet_Activity_Viewer.html');
writeFileSync(artifact, html);
const checksum = createHash('sha256').update(html).digest('hex');
writeFileSync(resolve(dist, 'Wallet_Activity_Viewer.html.sha256'), `${checksum}  Wallet_Activity_Viewer.html\n`);
console.log(`Built dist/activity-viewer/Wallet_Activity_Viewer.html (${Buffer.byteLength(html).toLocaleString()} bytes)`);
console.log(`SHA-256 ${checksum}`);
