import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, transform } from 'esbuild';
import { createBuildInfo } from '../../../tooling/build-metadata.mjs';
import {
  applyPsbtCompositionTemplate,
  assertPsbtComposition,
  createPsbtCompositionPlugin,
} from '../../../tooling/psbt-inspector-composition.mjs';
import {
  artifactDisplayName,
  customToolArtifact,
  parseRequestedOutput,
  parseToolFeatureOptions,
} from '../../../tooling/tool-feature-options.mjs';
import { applyProfileTemplate, getToolBuild, parseBuildProfile } from '../../../tooling/build-profiles.mjs';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const profile = parseBuildProfile();
const tool = getToolBuild(profile, 'psbt-inspector');
const options = parseToolFeatureOptions('psbt-inspector', profile);
const customArtifact = customToolArtifact(root, profile, 'psbt-inspector', tool, options, parseRequestedOutput());
const embedsBtcutil = options.hasCoin('bitcoin') && options.has('message-verification');
const scriptCsp = (javascript) =>
  `'sha256-${createHash('sha256').update(javascript).digest('base64')}'${embedsBtcutil ? " 'wasm-unsafe-eval'" : ''}`;
const sourceTemplate = readFileSync(resolve(root, 'apps/psbt-inspector/src/index.html'), 'utf8');
const customFields =
  /[ \t]*<!--__PSBT_CUSTOM_MINISCRIPT_FIELDS_START__-->[\s\S]*?<!--__PSBT_CUSTOM_MINISCRIPT_FIELDS_END__-->\n?/u;
const profileTemplate =
  profile.id === 'dash-community'
    ? sourceTemplate.replace(customFields, '')
    : sourceTemplate
        .replace('<!--__PSBT_CUSTOM_MINISCRIPT_FIELDS_START__-->', '')
        .replace('<!--__PSBT_CUSTOM_MINISCRIPT_FIELDS_END__-->', '');
const template = applyPsbtCompositionTemplate(applyProfileTemplate(profileTemplate, profile, tool), options);
const sharedCss = readFileSync(resolve(root, 'packages/shared-ui/styles/main.css'), 'utf8');
const appCss = readFileSync(resolve(root, 'apps/psbt-inspector/src/styles.css'), 'utf8');
const shellCss = readFileSync(resolve(root, 'packages/shared-ui/styles/tool-shell.css'), 'utf8');
const themeCss =
  profile.themeStylesheet === undefined ? '' : readFileSync(resolve(root, profile.themeStylesheet), 'utf8');
const css = (
  await transform(`${sharedCss}\n${appCss}\n${shellCss}\n${themeCss}`, {
    loader: 'css',
    minify: true,
    legalComments: 'inline',
  })
).code;
const buildInfo = createBuildInfo(root, tool.checksumFile, profile, {
  coins: options.coins,
  features: options.selected,
});
const dashCapabilitiesPlugin = {
  name: 'dash-psbt-capabilities',
  setup(buildContext) {
    buildContext.onResolve({ filter: /^\.\/(?:musig-descriptor|musig-psbt|custom-miniscript)\.js$/ }, ({ path }) => ({
      path: resolve(
        root,
        path === './musig-descriptor.js'
          ? 'apps/psbt-inspector/src/musig-descriptor-disabled.ts'
          : path === './musig-psbt.js'
            ? 'apps/psbt-inspector/src/musig-psbt-disabled.ts'
            : 'apps/psbt-inspector/src/custom-miniscript-disabled.ts',
      ),
    }));
  },
};
const btcutilPlugin = {
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
      contents: readFileSync(path, 'utf8').replaceAll(
        'new Function("m", "return import(m)")',
        '((moduleName) => Promise.reject(new Error(`Node-only module ${moduleName} is unavailable in the offline browser artifact.`)))',
      ),
      loader: 'js',
    }));
  },
};
const basePlugin = !options.hasCoin('bitcoin') ? dashCapabilitiesPlugin : embedsBtcutil ? btcutilPlugin : undefined;

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
  metafile: true,
  plugins: [createPsbtCompositionPlugin(root, options, basePlugin)],
  define: {
    __BUILD_INFO__: JSON.stringify(buildInfo),
    __PSBT_FEATURES__: JSON.stringify(options.selected),
    ...(embedsBtcutil ? { fetch: '__offlineNetworkDisabled' } : {}),
  },
  banner: embedsBtcutil
    ? {
        js: 'const __offlineNetworkDisabled=()=>{throw new Error("Network access is disabled in this offline artifact.")};',
      }
    : {},
  write: false,
});
assertPsbtComposition(options, Object.keys(bundled.metafile.inputs));
if (!options.hasCoin('bitcoin')) {
  const inputs = Object.keys(bundled.metafile.inputs).map((input) => input.replaceAll('\\', '/'));
  const forbidden = inputs.filter(
    (input) =>
      input.endsWith('/musig-descriptor.ts') ||
      input.endsWith('/musig-psbt.ts') ||
      input.endsWith('/custom-miniscript.ts') ||
      input.endsWith('/bip322-verifier.ts') ||
      input.endsWith('/message-verifier.ts') ||
      input.includes('/@scure/btc-signer/') ||
      input.includes('/btcutil-js/'),
  );
  if (forbidden.length > 0)
    throw new Error(
      `Dash Community PSBT bundle contains Bitcoin-only MuSig2, custom Tapscript, or BIP-322 inputs: ${forbidden.join(', ')}`,
    );
}
const javascript = bundled.outputFiles[0]?.text;
if (javascript === undefined) throw new Error('esbuild did not produce the PSBT & Multisig Inspector bundle.');
if (
  !template.includes('/*__INLINE_CSS__*/') ||
  !template.includes('/*__INLINE_JS__*/') ||
  !template.includes('__INLINE_SCRIPT_CSP__')
)
  throw new Error('PSBT & Multisig Inspector template is missing an inline build marker.');
const safeJavascript = javascript.replaceAll('</script', '<\\/script').replaceAll('<script', '\\x3cscript');
let html = template
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
writeFileSync(`${artifact}.sha256`, `${checksum}  ${artifactDisplayName(artifact)}\n`);
console.log(
  `Built ${customArtifact === undefined ? `dist/${tool.artifactRelativePath}` : artifact} (${Buffer.byteLength(html).toLocaleString()} bytes)`,
);
console.log(`SHA-256 ${checksum}`);
