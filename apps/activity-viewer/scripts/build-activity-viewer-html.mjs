import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, transform } from 'esbuild';
import { createBuildInfo } from '../../../tooling/build-metadata.mjs';
import {
  applyProfileTemplate,
  assertDashOnlyGraph,
  getToolBuild,
  parseBuildProfile,
} from '../../../tooling/build-profiles.mjs';
import { verifyDashSdkBuild } from '../../../tooling/verify-dash-sdk-build.mjs';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const profile = parseBuildProfile();
const tool = getToolBuild(profile, 'activity-viewer');
const scriptCsp = (javascript) => `'sha256-${createHash('sha256').update(javascript).digest('base64')}'`;
verifyDashSdkBuild(root, 'The viewer');
const template = applyProfileTemplate(
  readFileSync(resolve(root, 'apps/activity-viewer/src/index.html'), 'utf8'),
  profile,
  tool,
);
const sharedCss = readFileSync(resolve(root, 'packages/shared-ui/styles/main.css'), 'utf8');
const viewerCss = readFileSync(resolve(root, 'apps/activity-viewer/src/styles.css'), 'utf8');
const shellCss = readFileSync(resolve(root, 'packages/shared-ui/styles/tool-shell.css'), 'utf8');
const themeCss = profile.themeStylesheet === undefined
  ? ''
  : readFileSync(resolve(root, profile.themeStylesheet), 'utf8');
const viewerThemeCss = profile.id === 'dash-community'
  ? readFileSync(resolve(root, 'apps/activity-viewer/src/styles-dash-community.css'), 'utf8')
  : '';
const css = (await transform(`${sharedCss}\n${viewerCss}\n${viewerThemeCss}\n${shellCss}\n${themeCss}`, {
  loader: 'css',
  minify: true,
  legalComments: 'inline',
})).code;
const buildInfo = createBuildInfo(root, tool.checksumFile, profile);
const bundled = await build({
  absWorkingDir: root,
  entryPoints: [tool.entryPoint],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome120', 'firefox120', 'safari17'],
  treeShaking: true,
  minify: true,
  legalComments: 'inline',
  loader: { '.wasm': 'binary' },
  metafile: true,
  define: { __BUILD_INFO__: JSON.stringify(buildInfo) },
  write: false,
});
const javascript = bundled.outputFiles[0]?.text;
if (javascript === undefined) throw new Error('esbuild did not produce the viewer JavaScript bundle.');
if (profile.id === 'dash-community') {
  assertDashOnlyGraph(Object.keys(bundled.metafile.inputs), 'Dash Community activity viewer');
}
if (
  !template.includes('/*__INLINE_CSS__*/')
  || !template.includes('/*__INLINE_JS__*/')
  || !template.includes('__INLINE_SCRIPT_CSP__')
) {
  throw new Error('Viewer HTML template is missing an inline build marker.');
}
const safeJavascript = javascript
  .replaceAll('</script', '<\\/script')
  .replaceAll('<script', '\\x3cscript');
const html = template
  .replace('__INLINE_SCRIPT_CSP__', scriptCsp(safeJavascript))
  .replace('/*__INLINE_CSS__*/', () => css)
  .replace('/*__INLINE_JS__*/', () => safeJavascript);
const dist = resolve(root, 'dist', tool.artifactDirectory);
mkdirSync(dist, { recursive: true });
const artifact = resolve(dist, tool.artifactName);
writeFileSync(artifact, html);
const checksum = createHash('sha256').update(html).digest('hex');
writeFileSync(resolve(dist, tool.checksumFile), `${checksum}  ${tool.artifactName}\n`);
console.log(`Built dist/${tool.artifactRelativePath} (${Buffer.byteLength(html).toLocaleString()} bytes)`);
console.log(`SHA-256 ${checksum}`);
