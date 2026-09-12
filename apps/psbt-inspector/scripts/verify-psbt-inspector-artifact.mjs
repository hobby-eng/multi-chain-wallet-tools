import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBuildInfo } from '../../../tooling/build-metadata.mjs';
import { getToolBuild, parseBuildProfile } from '../../../tooling/build-profiles.mjs';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const profile = parseBuildProfile();
const tool = getToolBuild(profile, 'psbt-inspector');
const artifact = resolve(root, 'dist', tool.artifactRelativePath);
const sidecar = resolve(root, 'dist', tool.artifactDirectory, tool.checksumFile);
const html = readFileSync(artifact, 'utf8');
const expectedFingerprint = createBuildInfo(root, tool.checksumFile, profile).fingerprint;
if (!html.includes(expectedFingerprint)) {
  throw new Error('PSBT & Multisig Inspector artifact does not contain the fingerprint of the current source tree.');
}
const scriptStart = html.indexOf('<script>');
const scriptEnd = html.lastIndexOf('</script>');
if (scriptStart < 0 || scriptEnd <= scriptStart) {
  throw new Error('PSBT & Multisig Inspector artifact has no inline application script.');
}
const inlineScript = html.slice(scriptStart + '<script>'.length, scriptEnd);
const inlineScriptHash = `'sha256-${createHash('sha256').update(inlineScript).digest('base64')}'`;
const expectedCsp = `default-src 'none'; script-src ${inlineScriptHash}${profile.id === 'multi-chain' ? " 'wasm-unsafe-eval'" : ''}; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; connect-src 'none'; worker-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'`;
const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/u.exec(html)?.[1];
if (csp !== expectedCsp) throw new Error('PSBT & Multisig Inspector artifact CSP changed from the reviewed offline policy.');
if (/script-src[^;]*'unsafe-inline'/u.test(csp)) {
  throw new Error('PSBT & Multisig Inspector CSP must authorize its immutable inline script by hash, not unsafe-inline.');
}

function occurrences(value, marker) { return value.split(marker).length - 1; }
for (const [marker, expected] of [['<!doctype html>', 1], ['<style>', 1], ['</style>', 1], ['<script>', 1], ['</script>', 1]]) {
  if (occurrences(html, marker) !== expected) throw new Error(`Expected ${expected} PSBT & Multisig Inspector ${marker} marker.`);
}
for (const marker of [
  'PSBT & Multisig Inspector', profile.brandName, 'Inspect PSBT', 'Decode script', 'Build multisig policy', 'Verify message',
  'Transaction accounting', 'Transaction ID', 'Virtual size', 'scriptPubKey ASM', 'Raw / advanced PSBT maps',
  'No PSBT metadata supplied', 'Signing state', 'Verify a signed message', 'No private key is requested',
  'This does not create a PSBT',
  'Portable output descriptor', 'Miniscript fragment', 'Compiled Script ASM', 'Miniscript safety analysis', 'Policy expression',
  'Recovery multisig · M-of-N now OR R-of-K later', 'Flexible multisig · primary OR backup committee later', 'Escalating timelocked recovery',
  'Decaying multisig', 'Expanding multisig', 'Flexible multisig',
  'Multisig wallet', 'Build multisig outputs', 'Experimental utility — do not use with real funds yet',
  'Compressed child public keys or account xpubs',
  'Input is detected automatically',
  'BIP67 <code>sortedmulti()</code> is selected by default',
  'Results regenerate automatically after changing keys',
  'Receive addresses', 'Change addresses', 'Advanced', 'scroll-code',
  'Copy addresses', 'Copy public keys', 'Download selected', 'wallet-basic-table', 'wallet-inline-actions',
  'wallet-advanced-card',
  'BIP48-style Purpose48 account keys',
  "m/48'/coin_type'/account'/script_type'",
  'not an Electrum-only private address scheme',
  'Do not switch a mainnet xpub into testnet mode',
  "m/48'/5'/0'/0'/0/0",
  "m/44'/5'/0'/0/0",
  'individual single-signer receive addresses are not part of the multisig wallet',
  'private keys are needed only by signers when spending',
  'Supplied order · multi()', 'BIP67 sorted · sortedmulti()', 'Compressed child public keys or account xpubs',
  'Dash Core PSBT v0', 'Runtime network access blocked by this file',
  'connect-src \'none\'', 'worker-src \'none\'', 'Release passport', '70736274ff',
  'HTLC-like hashlock',
  'BitcoinerLab Miniscript safety analysis',
  'Descriptor wildcard index',
  'HTLC-like', 'Miniscript hashlocks require exactly 32 preimage bytes',
  'Local 32-byte preimage &amp; HTLC commitment calculator', 'Use in HTLC',
  'Compiled descriptor data', 'Policy tree', 'descriptor-path-card',
  profile.editionName, profile.id, tool.documentTitle,
]) if (!html.includes(marker)) throw new Error(`PSBT & Multisig Inspector artifact is missing required marker: ${marker}`);
const profileMarkers = profile.id === 'dash-community'
  ? ['Dash descriptor coverage', 'SegWit, Taproot, Schnorr, and MuSig2 are excluded', 'class="profile-brand-mark"', '--dash-brand-blue:#5485ff']
  : ['Bitcoin PSBT v0 / v2', 'Bitcoin descriptor coverage', 'MuSig2 scope', 'interactive partial-signature rounds', 'Scure BTC Signer 2.4.1', 'BIP-373 fields', 'Nunchuk-style templates', 'Custom Bitcoin Miniscript', 'Taproot P2TR · Tapscript policy', 'Taproot P2TR · MuSig2 key path', 'all four hashlocks', 'wrappers <code>a s c t d v j n l u</code>', 'does not have a unique inverse Miniscript expression', 'BIP-322 legacy, simple, full, and proof-of-funds'];
for (const marker of profileMarkers) if (!html.includes(marker)) throw new Error(`PSBT & Multisig Inspector artifact is missing required profile marker: ${marker}`);
if (html.includes('__INLINE_SCRIPT_CSP__') || html.includes('/*__INLINE_')) {
  throw new Error('PSBT & Multisig Inspector artifact still contains an unexpanded build marker.');
}
for (const forbidden of [/<script\b[^>]+src=/iu, /<link\b[^>]+href=/iu, /\blocalStorage\b/u, /\bsessionStorage\b/u, /\bindexedDB\b/u, /\bdocument\.cookie\b/u, /\binnerHTML\b/u, /\bfetch\s*\(/u, /\bWebSocket\b/u, /sourceMappingURL/u]) {
  if (forbidden.test(html)) throw new Error(`PSBT & Multisig Inspector artifact contains forbidden surface ${String(forbidden)}.`);
}
const markupWithoutScript = html.slice(0, scriptStart) + html.slice(scriptEnd + '</script>'.length);
if (profile.id === 'dash-community') {
  if (markupWithoutScript.includes('value="bitcoin"') || markupWithoutScript.includes('value="p2wsh"') || markupWithoutScript.includes('value="p2tr"') || markupWithoutScript.includes('value="p2tr-musig2"')) {
    throw new Error('Dash Community PSBT Inspector exposes a Bitcoin chain, SegWit wrapper, or Taproot wrapper control.');
  }
  if (markupWithoutScript.includes('Scure BTC Signer 2.4.1')) {
    throw new Error('Dash Community PSBT Inspector discloses a Bitcoin-only MuSig2 dependency.');
  }
  if (markupWithoutScript.includes('custom-miniscript') || markupWithoutScript.includes('Custom Bitcoin Miniscript')) {
    throw new Error('Dash Community PSBT Inspector exposes the Bitcoin-only custom Miniscript builder.');
  }
  if (html.includes('btcutil-js') || html.includes('BIP0322-signed-message')) {
    throw new Error('Dash Community PSBT Inspector bundles the Bitcoin-only BIP-322 verifier.');
  }
}
const ids = [...markupWithoutScript.matchAll(/<[^>]+\sid="([^"]+)"/gu)].map((match) => match[1]);
if (new Set(ids).size !== ids.length) throw new Error('PSBT & Multisig Inspector artifact contains duplicate IDs.');
for (const match of html.matchAll(/<label\b[^>]*\bfor="([^"]+)"/gu)) {
  if (!ids.includes(match[1])) throw new Error(`PSBT & Multisig Inspector label references missing control #${match[1]}.`);
}
try { Function(inlineScript); } catch (cause) { throw new Error(`PSBT & Multisig Inspector JavaScript is invalid: ${String(cause)}`); }
const actual = createHash('sha256').update(html).digest('hex');
const recorded = readFileSync(sidecar, 'utf8').trim();
if (recorded !== `${actual}  ${tool.artifactName}`) throw new Error('PSBT & Multisig Inspector checksum sidecar does not match.');
console.log(`Verified offline PSBT & Multisig Inspector artifact: ${actual}`);
