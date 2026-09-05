import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBuildInfo } from '../../../tooling/build-metadata.mjs';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const artifactPath = resolve(root, 'dist/key-derivation/Wallet_Key_Derivation_Tool.html');
const checksumPath = resolve(root, 'dist/key-derivation/Wallet_Key_Derivation_Tool.html.sha256');
const wasmPath = resolve(root, 'packages/dash-shielded-wasm/generated/dash_shielded_wasm_bg.wasm');
const html = readFileSync(artifactPath, 'utf8');
const expectedFingerprint = createBuildInfo(root, 'Wallet_Key_Derivation_Tool.html.sha256').fingerprint;
if (!html.includes(expectedFingerprint)) {
  throw new Error('Standalone artifact does not contain the fingerprint of the current source tree.');
}

function occurrences(value, marker) {
  return value.split(marker).length - 1;
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
  if (actual !== expected) throw new Error(`Expected ${expected} ${marker} marker; found ${actual}.`);
}

const inlineScript = /<script>([\s\S]*)<\/script>/u.exec(html)?.[1];
if (inlineScript === undefined) throw new Error('Standalone artifact has no inline application script.');
try {
  // Parse without executing browser or cryptographic code.
  Function(inlineScript);
} catch (cause) {
  throw new Error(`Standalone application JavaScript is syntactically invalid: ${String(cause)}`);
}

const inlineScriptHash = `'sha256-${createHash('sha256').update(inlineScript).digest('base64')}'`;
const expectedCsp = `default-src 'none'; script-src ${inlineScriptHash} 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; font-src 'none'; connect-src 'none'; worker-src blob:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'`;
const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/u.exec(html)?.[1];
if (csp !== expectedCsp) throw new Error('Standalone artifact CSP changed from the reviewed offline policy.');
if (/script-src[^;]*'unsafe-inline'/u.test(csp)) {
  throw new Error('Standalone CSP must authorize its immutable inline script by hash, not unsafe-inline.');
}
// 'wasm-unsafe-eval' only compiles the embedded module; the separate
// 'unsafe-eval' keyword would additionally enable the Function constructor.
// The quotes matter: they are what distinguishes the two tokens.
if (csp.includes("'unsafe-eval'")) throw new Error("Standalone CSP must never grant 'unsafe-eval'.");
if (html.includes('__INLINE_SCRIPT_CSP__') || html.includes('/*__INLINE_')) {
  throw new Error('Standalone artifact still contains an unexpanded build marker.');
}

const ids = [...html.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1]);
if (new Set(ids).size !== ids.length) throw new Error('Standalone artifact contains duplicate HTML IDs.');
for (const requiredId of [
  'derive-form',
  'mnemonic',
  'passphrase',
  'coin',
  'protocol-tabs',
  'network',
  'include-change-addresses',
  'derive-button',
  'cancel-derivation',
  'toggle-sensitive-values',
  'copy-mnemonic',
  'copy-watch-only',
  'download-watch-only',
  'download-selection',
  'watch-only-export',
  'expected-address',
  'search-address',
  'clear-all',
  'results',
  'result-branch-tabs',
  'result-receive-tab',
  'result-change-tab',
  'branch-result-content',
  'address-list',
  'build-version',
  'build-date',
  'worker-runtime',
  'build-fingerprint',
  'crypto-self-test-status',
  'crypto-self-test-details',
  'artifact-checksum-file',
]) {
  if (!ids.includes(requiredId)) throw new Error(`Standalone artifact is missing required element #${requiredId}.`);
}
for (const match of html.matchAll(/<label\b[^>]*\bfor="([^"]+)"/gu)) {
  if (!ids.includes(match[1])) throw new Error(`Label references missing control #${match[1]}.`);
}

const required = [
  '<!doctype html>',
  "connect-src 'none'",
  'worker-src blob:',
  "'wasm-unsafe-eval'",
  'Wallet Key Derivation Tool',
  'Recovery seed phrase',
  'Reveal all sensitive values',
  'Derivation type',
  'dash-identity',
  'DIP13',
  'Official Platform Wallet v4.1.1',
  'Identity ID',
  'Also generate change addresses',
  'Receive addresses',
  'Change addresses',
  'Find a known address',
  'Watch-only export',
  'Cancel generation',
  'Download selected',
  'Release passport',
  'Embedded dependency versions and licenses:',
  'Cryptographic self-test running',
  'Dedicated Web Worker',
  'wallet-key-derivation',
  'type:"ready"',
  'The derivation worker stopped unexpectedly.',
  'Only this visible window is kept in the page DOM.',
  'Confirm large request',
  'visibilitychange',
  'ACCOUNT-SCOPED MATERIAL',
  'dashified-0.14.1',
];
for (const marker of required) {
  if (!html.includes(marker)) throw new Error(`Standalone artifact is missing required marker: ${marker}`);
}
if (occurrences(html, 'Embedded dependency versions and licenses') !== 1) {
  throw new Error('Dependency versions must appear exactly once inside the Release passport.');
}
if (html.includes('<details class="dependency-info">')) {
  throw new Error('The obsolete duplicated dependency disclosure remains outside the Release passport.');
}
if (html.includes('Advanced cryptographic details')) {
  throw new Error('Advanced result fields are still hidden behind a redundant disclosure control.');
}
for (const obsoleteId of ['toggle-input-secrets', 'toggle-result-secrets']) {
  if (ids.includes(obsoleteId)) throw new Error(`Standalone artifact still contains obsolete split reveal control #${obsoleteId}.`);
}
if (html.includes('To inspect activity on a connected computer, use the separate Wallet_Activity_Viewer.html')) {
  throw new Error('Standalone artifact still contains the removed repeated Shielded viewer notice.');
}

const forbidden = [
  [/\bfetch\s*\(/u, 'fetch'],
  [/\bXMLHttpRequest\b/u, 'XMLHttpRequest'],
  [/\bWebSocket\b/u, 'WebSocket'],
  [/\bEventSource\b/u, 'EventSource'],
  [/\bRTCPeerConnection\b/u, 'WebRTC'],
  [/\bWebTransport\b/u, 'WebTransport'],
  [/\bsendBeacon\b/u, 'sendBeacon'],
  [/\blocalStorage\b/u, 'localStorage'],
  [/\bsessionStorage\b/u, 'sessionStorage'],
  [/\bindexedDB\b/u, 'IndexedDB'],
  [/\bMath\.random\b/u, 'Math.random'],
  [/\binnerHTML\b/u, 'innerHTML'],
  [/\bouterHTML\b/u, 'outerHTML'],
  [/\binsertAdjacentHTML\b/u, 'insertAdjacentHTML'],
  [/\bdocument\.cookie\b/u, 'cookie access'],
  [/\beval\s*\(/u, 'JavaScript eval'],
  [/\bnew\s+Function\b/u, 'Function constructor'],
  [/\bdata-(?:copy-value|value)\s*=/iu, 'secret-bearing data attribute'],
  [/sourceMappingURL/u, 'source map reference'],
  [/https?:\/\//iu, 'HTTP URL'],
  [/(?:src|href)\s*=\s*["'](?:https?:|\/\/|\.\/|\.\.\/|file:)/iu, 'external or sibling resource'],
];
for (const [pattern, label] of forbidden) {
  if (pattern.test(html)) throw new Error(`Standalone artifact contains forbidden ${label}.`);
}
const expectedWasmBase64 = readFileSync(wasmPath).toString('base64');
const wasmCopies = occurrences(html, expectedWasmBase64);
if (wasmCopies !== 1) throw new Error(`Expected exactly one embedded Orchard WASM module; found ${wasmCopies}.`);
const wordlistMarker = 'abandon\nability\nable\nabout\nabove\nabsent';
const escapedWordlistMarker = 'abandon\\nability\\nable\\nabout\\nabove\\nabsent';
const wordlistCopies = occurrences(html, wordlistMarker) + occurrences(html, escapedWordlistMarker);
if (wordlistCopies !== 1) throw new Error(`Expected exactly one embedded BIP39 English wordlist; found ${wordlistCopies}.`);
for (const deceptiveWipe of [".repeat(mnemonicLength)", ".repeat(passphraseLength)"]) {
  if (html.includes(deceptiveWipe)) throw new Error('Artifact contains a misleading JavaScript string-overwrite pattern.');
}

const actual = createHash('sha256').update(html).digest('hex');
const recorded = readFileSync(checksumPath, 'utf8').trim().split(/\s+/u)[0];
if (actual !== recorded) throw new Error('Recorded SHA-256 checksum does not match the HTML.');
console.log(`Verified standalone offline artifact: ${actual}`);
