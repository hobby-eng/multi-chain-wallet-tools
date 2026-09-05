import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBuildInfo } from '../../../tooling/build-metadata.mjs';
import { assertEvoSdkReadOnly } from '../../../tooling/verify-evo-read-only.mjs';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const artifactPath = resolve(root, 'dist/activity-viewer/Wallet_Activity_Viewer.html');
const checksumPath = resolve(root, 'dist/activity-viewer/Wallet_Activity_Viewer.html.sha256');
const orchardWasmPath = resolve(root, 'packages/dash-shielded-wasm/generated/dash_shielded_wasm_bg.wasm');
const html = readFileSync(artifactPath, 'utf8');
const expectedFingerprint = createBuildInfo(root, 'Wallet_Activity_Viewer.html.sha256').fingerprint;
if (!html.includes(expectedFingerprint)) {
  throw new Error('Viewer artifact does not contain the fingerprint of the current source tree.');
}
function occurrences(value, marker) {
  return value.split(marker).length - 1;
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return entry.isFile() && path.endsWith('.ts') ? [{ path, text: readFileSync(path, 'utf8') }] : [];
    });
}

for (const [marker, expected] of [
  ['<!doctype html>', 1],
  ['<html lang="en">', 1],
  ['</html>', 1],
  ['<style>', 1],
  ['</style>', 1],
  ['<script>', 1],
  ['</script>', 1],
]) {
  const actual = occurrences(html, marker);
  if (actual !== expected) throw new Error(`Expected ${expected} viewer ${marker} marker; found ${actual}.`);
}

const scriptStart = html.indexOf('<script>');
const scriptEnd = html.lastIndexOf('</script>');
if (scriptStart < 0 || scriptEnd <= scriptStart) {
  throw new Error('Viewer artifact has no inline application script.');
}
const inlineScript = html.slice(scriptStart + '<script>'.length, scriptEnd);
const inlineScriptHash = `'sha256-${createHash('sha256').update(inlineScript).digest('base64')}'`;
const expectedCsp = `default-src 'none'; script-src ${inlineScriptHash} 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; connect-src https:; worker-src blob:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'`;
const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/u.exec(html)?.[1];
if (csp !== expectedCsp) throw new Error('Viewer artifact CSP changed from the reviewed connected policy.');
if (/script-src[^;]*'unsafe-inline'/u.test(csp)) {
  throw new Error('Viewer CSP must authorize its immutable inline script by hash, not unsafe-inline.');
}
// The pinned Evo SDK's wasm-bindgen glue hands the WASM module a `new Function`
// import. It is inert only because the policy withholds 'unsafe-eval', so that
// absence is asserted by name and not merely implied by the string above. The
// quotes matter: they distinguish it from the permitted 'wasm-unsafe-eval'.
if (csp.includes("'unsafe-eval'")) throw new Error("Viewer CSP must never grant 'unsafe-eval'.");
if (html.includes('__INLINE_SCRIPT_CSP__') || html.includes('/*__INLINE_')) {
  throw new Error('Viewer artifact still contains an unexpanded build marker.');
}
const styleStart = html.indexOf('<style>');
const styleEnd = html.indexOf('</style>', styleStart);
const inlineStyle = html.slice(styleStart + '<style>'.length, styleEnd);
if (inlineStyle.length < 10_000) throw new Error('Viewer artifact inline stylesheet is unexpectedly small.');
for (const marker of [
  'color-scheme:dark',
  '--bg:#080b10',
  '.viewer-hero-grid',
  '.viewer-capability-card',
  '.viewer-flow',
  '.viewer-detection-tabs',
  '.viewer-mode-tabs',
  '.viewer-diagnostics',
  '.viewer-summary',
  '.viewer-activity-card',
  '.viewer-address-card',
]) {
  if (!inlineStyle.includes(marker)) throw new Error(`Viewer stylesheet is missing required design marker: ${marker}`);
}
if (inlineStyle.includes('__INLINE_CSS__')) throw new Error('Viewer CSS build marker was not replaced.');
try {
  Function(inlineScript);
} catch (cause) {
  throw new Error(`Viewer application JavaScript is syntactically invalid: ${String(cause)}`);
}

const ids = [...html.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1]);
if (new Set(ids).size !== ids.length) throw new Error('Viewer artifact contains duplicate HTML IDs.');
for (const requiredId of [
  'viewer-form',
  'viewer-network',
  'viewer-key-capability',
  'viewer-privacy-chip',
  'full-viewing-key',
  'viewer-batch-input',
  'viewer-batch-concurrency',
  'viewer-batch-results',
  'viewer-advanced-modes',
  'viewer-key-mode',
  'viewer-history-limit',
  'scan-button',
  'cancel-button',
  'clear-viewer',
  'viewer-results',
  'viewer-summary',
  'viewer-activity',
  'viewer-export-actions',
  'viewer-export-csv',
  'viewer-export-xlsx',
  'viewer-export-json',
  'diagnostic-state',
  'diagnostic-mode',
  'diagnostic-source',
  'diagnostic-requests',
  'diagnostic-proof',
  'diagnostic-remote-time',
  'diagnostic-timing',
  'diagnostic-detail',
  'viewer-build-footer',
  'viewer-crypto-self-test-status',
  'viewer-crypto-self-test-details',
  'viewer-build-version',
  'viewer-build-date',
  'viewer-runtime',
  'viewer-build-fingerprint',
  'viewer-artifact-checksum-file',
]) {
  if (!ids.includes(requiredId)) throw new Error(`Viewer artifact is missing required element #${requiredId}.`);
}
for (const match of html.matchAll(/<label\b[^>]*\bfor="([^"]+)"/gu)) {
  if (!ids.includes(match[1])) throw new Error(`Viewer label references missing control #${match[1]}.`);
}

for (const marker of [
  "connect-src https:",
  'worker-src blob:',
  "'wasm-unsafe-eval'",
  'Wallet Activity Viewer',
  'Dash Core · L1 address',
  'Dash Platform address',
  'Dash Platform Identity',
  'Batch · mixed inputs',
  'Auto detect',
  'Advanced · choose type',
  'orchard-ovk:',
  'Inputs queried at once',
  'Private key-like material was detected and erased',
  'deduplicated by transaction hash',
  'Connection &amp; scan diagnostics',
  'Full Viewing Key',
  'Incoming Viewing Key',
  'Outgoing Viewing Key',
  'Auto-detected by length',
  'dash-shielded-viewing-bundle',
  'Evo SDK 4.1.1',
  'dashified-0.14.1',
  'DashScan Core API',
  'Dash Platform Explorer',
  'Export loaded data',
  'write-excel-file 4.1.1',
  'fflate 0.8.3',
  'wallet-activity-viewer-export',
  'Release passport',
  'Embedded dependency versions and licenses:',
  'Cryptographic self-test running',
  'Dash Orchard ZIP-32 fixed vector',
  'Blob Worker execution',
  'The Dash mark is an official brand asset used under CC BY 4.0.',
  '<circle fill="#008de4"',
]) {
  if (!html.includes(marker)) throw new Error(`Viewer artifact is missing required marker: ${marker}`);
}
if (occurrences(html, 'Embedded dependency versions and licenses') !== 1) {
  throw new Error('Viewer dependency versions must appear exactly once inside the Release passport.');
}

const coreTab = html.indexOf('data-viewer-mode="core"');
const platformTab = html.indexOf('data-viewer-mode="platform"');
const identityTab = html.indexOf('data-viewer-mode="identity"');
const orchardTab = html.indexOf('data-viewer-mode="shielded"');
if (!(coreTab >= 0 && coreTab < platformTab && platformTab < identityTab && identityTab < orchardTab)) {
  throw new Error('Viewer tabs must be ordered Core, Platform address, Platform Identity, Orchard.');
}
if (!/<button class="viewer-mode-tab active" data-viewer-mode="core"[^>]+aria-pressed="true"/u.test(html)) {
  throw new Error('Dash Core must be the default Advanced viewer type.');
}
if (!/<button class="viewer-detection-tab active" data-detection-mode="auto"[^>]+aria-pressed="true"/u.test(html)) {
  throw new Error('Automatic local input detection must be enabled by default.');
}
if (!/<button[^>]*id="scan-button"[^>]*disabled/u.test(html)) {
  throw new Error('Viewer query button must start fail-closed until its cryptographic self-test passes.');
}
if (html.includes('<span class="viewer-brand-mark">D</span>')) {
  throw new Error('Viewer still contains the old homemade Dash letter mark.');
}

for (const [pattern, label] of [
  [/\blocalStorage\b/u, 'localStorage'],
  [/\bsessionStorage\b/u, 'sessionStorage'],
  [/\bindexedDB\b/u, 'IndexedDB'],
  [/\bdocument\.cookie\b/u, 'cookie access'],
  [/\binnerHTML\b/u, 'innerHTML'],
  [/\bouterHTML\b/u, 'outerHTML'],
  [/\binsertAdjacentHTML\b/u, 'insertAdjacentHTML'],
  [/\bdata-(?:copy-value|value)\s*=/iu, 'secret-bearing data attribute'],
  [/sourceMappingURL/u, 'source map reference'],
  [/<script\b[^>]+src=/iu, 'external script'],
  [/<link\b[^>]+href=/iu, 'external stylesheet'],
]) {
  if (pattern.test(inlineScript)) throw new Error(`Viewer JavaScript contains forbidden ${label}.`);
}
if (!html.includes('AGFzbQ') && !html.includes('AGFzbQE')) {
  throw new Error('Embedded WebAssembly was not found in the viewer artifact.');
}
if (html.includes("worker-src 'none'")) throw new Error('Viewer blocks the official Evo SDK Blob compilation worker.');
const expectedOrchardWasm = readFileSync(orchardWasmPath).toString('base64');
if (occurrences(html, expectedOrchardWasm) !== 1) {
  throw new Error('Viewer does not embed exactly one byte-identical pinned Orchard WASM module.');
}
assertEvoSdkReadOnly([
  ...sourceFiles(resolve(root, 'apps/activity-viewer/src')),
  ...sourceFiles(resolve(root, 'packages/dash-network/src')),
].map(({ path }) => path), 'Viewer source', root);

const actual = createHash('sha256').update(html).digest('hex');
const recorded = readFileSync(checksumPath, 'utf8').trim().split(/\s+/u)[0];
if (actual !== recorded) throw new Error('Viewer SHA-256 sidecar does not match its HTML.');
console.log(`Verified separate network-enabled viewer artifact: ${actual}`);
