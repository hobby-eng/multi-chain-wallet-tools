import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const sourceRoot = resolve(root, 'apps/discovery-scanner/src');
const artifactPath = resolve(root, 'dist/discovery-scanner/Wallet_Discovery_Scanner.html');
const checksumPath = resolve(root, 'dist/discovery-scanner/Wallet_Discovery_Scanner.html.sha256');
const orchardWasmPath = resolve(root, 'packages/dash-shielded-wasm/generated/dash_shielded_wasm_bg.wasm');
const html = readFileSync(artifactPath, 'utf8');
const vaultTemplate = readFileSync(resolve(sourceRoot, 'index.html'), 'utf8');
const shellTemplate = readFileSync(resolve(sourceRoot, 'shell.html'), 'utf8');

function occurrences(value, marker) {
  return value.split(marker).length - 1;
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && path.endsWith('.ts') ? [{ path, text: readFileSync(path, 'utf8') }] : [];
  });
}

function idsIn(markup) {
  return [...markup.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1]);
}

function assertNoDuplicateIds(markup, label) {
  const ids = idsIn(markup);
  if (new Set(ids).size !== ids.length) throw new Error(`${label} contains duplicate HTML IDs.`);
  return ids;
}

const expectedOuterCspPrefix = "default-src 'none'; script-src ";
const expectedOuterCspSuffix = " 'wasm-unsafe-eval'; style-src 'unsafe-inline'; connect-src https:; worker-src blob:; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";
const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/u.exec(html)?.[1];
if (csp === undefined || !csp.startsWith(expectedOuterCspPrefix) || !csp.endsWith(expectedOuterCspSuffix)) {
  throw new Error('Recovery shell CSP changed from the reviewed isolated-network policy.');
}
if (/script-src[^;]*'unsafe-inline'/u.test(csp)) {
  throw new Error('Recovery shell CSP must authorize its immutable inline script by hash, not unsafe-inline.');
}
if (csp.includes("'unsafe-eval'")) throw new Error("Recovery CSP must never grant 'unsafe-eval'.");

const scriptStart = html.indexOf('<script>');
const scriptEnd = html.lastIndexOf('</script>');
const styleStart = html.indexOf('<style>');
const styleEnd = html.indexOf('</style>', styleStart);
if (scriptStart < 0 || scriptEnd <= scriptStart || styleStart < 0 || styleEnd <= styleStart) {
  throw new Error('Recovery artifact has no complete isolation-shell script/style pair.');
}
const inlineScript = html.slice(scriptStart + '<script>'.length, scriptEnd);
const shellScriptHash = `'sha256-${createHash('sha256').update(inlineScript).digest('base64')}'`;
if (!csp.includes(shellScriptHash)) throw new Error('Recovery shell CSP hash does not match its inline script bytes.');
const outerScriptHashes = [...csp.matchAll(/'sha256-[A-Za-z0-9+/]+=*'/gu)].map((match) => match[0]);
if (outerScriptHashes.length !== 2 || new Set(outerScriptHashes).size !== 2) {
  throw new Error('Recovery shell CSP must authorize exactly the shell and inherited srcdoc-vault script hashes.');
}
const inheritedVaultHash = outerScriptHashes.find((hash) => hash !== shellScriptHash);
if (inheritedVaultHash === undefined || occurrences(html, inheritedVaultHash) < 2) {
  throw new Error('Recovery shell CSP does not repeat the embedded vault hash required by srcdoc CSP inheritance.');
}
try {
  Function(inlineScript);
} catch (cause) {
  throw new Error(`Recovery isolation-shell JavaScript is syntactically invalid: ${String(cause)}`);
}

const outerIds = assertNoDuplicateIds(shellTemplate, 'Recovery shell template');
for (const id of ['recovery-secret-vault', 'recovery-shell-error']) {
  if (!outerIds.includes(id)) throw new Error(`Recovery shell is missing required element #${id}.`);
}
const iframe = /<iframe\b[^>]+id="recovery-secret-vault"[^>]*>/u.exec(shellTemplate)?.[0];
if (iframe === undefined || !/\bsandbox="allow-scripts"/u.test(iframe)) {
  throw new Error('Recovery Secret Vault must be sandboxed with scripts as its only sandbox capability.');
}
for (const forbidden of ['allow-downloads', 'allow-same-origin', 'allow-forms', 'allow-popups', 'allow-top-navigation']) {
  if (iframe.includes(forbidden)) throw new Error(`Recovery Secret Vault unexpectedly grants ${forbidden}.`);
}

const vaultCsp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/u.exec(vaultTemplate)?.[1] ?? '';
if (!/(?:^|;)\s*connect-src\s+'none'\s*(?:;|$)/u.test(vaultCsp)) {
  throw new Error("Recovery Secret Vault must enforce connect-src 'none'.");
}
if (!/(?:^|;)\s*worker-src\s+'none'\s*(?:;|$)/u.test(vaultCsp)) {
  throw new Error("Recovery Secret Vault must enforce worker-src 'none'.");
}
if (!/script-src __VAULT_SCRIPT_CSP__ 'wasm-unsafe-eval'/u.test(vaultCsp)) {
  throw new Error('Recovery Secret Vault script policy no longer uses a build-time SHA-256 placeholder.');
}
if (html.includes('__VAULT_SCRIPT_CSP__') || html.includes('__SHELL_SCRIPT_CSP__') || html.includes('/*__INLINE_')) {
  throw new Error('Recovery artifact still contains an unexpanded build marker.');
}
if (!html.includes("connect-src 'none'")) throw new Error('Embedded Recovery Secret Vault CSP is missing from the artifact.');
if (!html.includes('connect-src https:')) throw new Error('Recovery Network Worker shell has no HTTPS permission.');

const vaultIds = assertNoDuplicateIds(vaultTemplate, 'Recovery Secret Vault template');
for (const requiredId of [
  'recovery-form', 'recovery-coin', 'recovery-network', 'recovery-account',
  'single-mnemonic', 'single-passphrase', 'batch-mnemonics', 'batch-passphrases', 'batch-concurrency',
  'reveal-recovery-input', 'core-receive-count', 'core-change-count', 'platform-address-count',
  'identity-start-index', 'identity-gap-limit', 'identity-scan-limit', 'request-concurrency',
  'include-used-zero-balance', 'scan-shielded', 'scan-estimate', 'start-recovery-scan',
  'start-recovery-scan-label', 'cancel-recovery-scan', 'clear-recovery', 'recovery-progress',
  'recovery-wallet-progress', 'recovery-results', 'recovery-result-tabs', 'recovery-result-list',
  'export-recovery-csv', 'export-recovery-json', 'recovery-self-test', 'recovery-build-footer',
  'recovery-crypto-self-test-status', 'recovery-crypto-self-test-details', 'recovery-build-version',
  'recovery-build-date', 'recovery-runtime', 'recovery-build-fingerprint', 'recovery-artifact-checksum-file',
]) {
  if (!vaultIds.includes(requiredId)) throw new Error(`Recovery Secret Vault is missing required element #${requiredId}.`);
}
for (const match of vaultTemplate.matchAll(/<label\b[^>]*\bfor="([^"]+)"/gu)) {
  if (!vaultIds.includes(match[1])) throw new Error(`Recovery label references missing control #${match[1]}.`);
}

for (const marker of [
  'Wallet Discovery Scanner', 'Opaque-origin Secret Vault', 'Vault network disabled by CSP',
  'This utility has not been independently audited by a cryptography specialist.',
  'Select the Dash components and address ranges you want to check.', 'Core receive minimum', 'Core change minimum', 'Platform address minimum',
  'Identity empty-gap limit', 'Platform identities', 'Account-wide encrypted notes', 'spent or previously used resources with zero balance',
  'CoinJoin', '20 addresses after the last used address', 'Self-test running', 'ALL SEED PHRASES',
  'STANDARD-WALLET HANDOFF', 'Run a new scan', 'bounded-memory page stream',
  'Release passport', 'Cryptographic self-test running', 'Embedded dependency versions and licenses:',
  'Dash Identity mainnet / DIP13', 'Dash Identity testnet / DIP13',
  'Wallet-wide located balances', 'Identity credits',
  'Lifetime self/change', 'Spent at pool position', 'section_lifetime_received_dash',
  'No funded Dash Core L1 address was found in this section and scanned range.',
  'The Dash mark is an official brand asset used under CC BY 4.0.', '<circle fill="#008de4"',
  'wallet-discovery-report', 'Blocked ', 'Dash Platform DAPI', 'DashScan',
  'recovery CSV report export', 'recovery JSON report export',
  'isolated-network-worker-v1', 'core.address-info',
  'platform.address-history', 'platform.identity-by-public-key-hash',
  'platform.identity-history', 'shielded.page', 'ckd-recovery-export-request-v1',
]) {
  if (!html.includes(marker)) throw new Error(`Recovery artifact is missing required marker: ${marker}`);
}
const allFunctionConstructors = html.match(/(?:^|[^.\w])(?:new\s+)?Function\s*\(/gu) ?? [];
if (
  occurrences(html, 'new Function') !== 2
  || allFunctionConstructors.length !== 3
  || occurrences(html, 'Function(${o})') !== 1
  || !html.includes('return import(\"node:zlib\")')
) {
  throw new Error('Recovery artifact changed from the two reviewed, CSP-blocked SDK dynamic-code glue paths.');
}
if (occurrences(html, 'Embedded dependency versions and licenses') !== 1) {
  throw new Error('Recovery dependency versions must appear exactly once inside the Release passport.');
}
if (html.includes('<span class="recovery-brand-mark">D</span>')) throw new Error('Recovery still contains the old homemade Dash letter mark.');
if (html.includes('Spent / not spendable')) throw new Error('Recovery exposes spent Orchard notes in the default spendable-only presentation.');

for (const id of ['core-receive-count', 'core-change-count', 'platform-address-count']) {
  const tag = new RegExp(`<input[^>]+id="${id}"[^>]*>`, 'u').exec(vaultTemplate)?.[0];
  if (tag === undefined) throw new Error(`Recovery count input #${id} is missing.`);
  if (/\bmax=/u.test(tag)) throw new Error(`Recovery count input #${id} has an artificial HTML maximum.`);
}
const startButtonTag = /<button[^>]+id="start-recovery-scan"[^>]*>/u.exec(vaultTemplate)?.[0];
if (startButtonTag === undefined || !/\btype="button"/u.test(startButtonTag)) {
  throw new Error('Recovery start control must be a non-submit button because the Secret Vault intentionally lacks allow-forms.');
}
for (const [pattern, label] of [
  [/\blocalStorage\b/u, 'localStorage'], [/\bsessionStorage\b/u, 'sessionStorage'],
  [/\bindexedDB\b/u, 'IndexedDB'], [/\bdocument\.cookie\b/u, 'cookie access'],
  [/\bdata-(?:copy-value|value)\s*=/iu, 'secret-bearing data attribute'],
  [/sourceMappingURL/u, 'source map reference'], [/<script\b[^>]+src=/iu, 'external script'],
  [/<link\b[^>]+href=/iu, 'external stylesheet'],
]) {
  if (pattern.test(html)) throw new Error(`Recovery artifact contains forbidden ${label}.`);
}
if (!html.includes('AGFzbQ') && !html.includes('AGFzbQE')) throw new Error('Embedded WebAssembly was not found in the recovery artifact.');
const expectedOrchardWasm = readFileSync(orchardWasmPath).toString('base64');
if (occurrences(html, expectedOrchardWasm) !== 1) {
  throw new Error('Recovery does not embed exactly one byte-identical pinned Orchard WASM module.');
}

const allRecoverySources = sourceFiles(sourceRoot);
const vaultSources = allRecoverySources
  .filter(({ path }) => !/(?:network-service|network-worker|shell)\.ts$/u.test(path))
  .map(({ text }) => text)
  .join('\n');
for (const [pattern, label] of [
  [/@dashevo\/evo-sdk/u, 'Evo SDK import'], [/\bEvoSDK\b/u, 'Evo SDK reference'],
  [/\bglobalThis\.fetch\b/u, 'global fetch'], [/(?:^|[^.\w])fetch\s*\(/mu, 'direct fetch call'],
  [/\bXMLHttpRequest\b/u, 'XMLHttpRequest'], [/\bWebSocket\b/u, 'WebSocket'],
  [/URL\.createObjectURL/u, 'direct object-URL creation'], [/\.download\s*=/u, 'direct download initiation'],
]) {
  if (pattern.test(vaultSources)) throw new Error(`Recovery Secret Vault source contains forbidden ${label}.`);
}

const networkSources = ['network-protocol.ts', 'network-service.ts', 'network-worker.ts']
  .map((name) => readFileSync(resolve(sourceRoot, name), 'utf8'))
  .join('\n');
for (const [pattern, label] of [
  [/mnemonicToSeed|assertValidMnemonic|\bmnemonic\b|\bpassphrase\b/iu, 'mnemonic/passphrase handling'],
  [/deriveDash|rootFromSeed|fullViewingKey|spendingKey/iu, 'secret derivation'],
  [/secret-guard|SecretEgressGuard/iu, 'Secret Vault guard import'],
]) {
  if (pattern.test(networkSources)) throw new Error(`Recovery Network Worker source contains forbidden ${label}.`);
}
const protocolSource = readFileSync(resolve(sourceRoot, 'network-protocol.ts'), 'utf8');
if (/\burl\s*:/iu.test(protocolSource)) throw new Error('Recovery Network RPC must not accept an arbitrary URL.');
for (const operation of [
  'ping', 'core.status', 'core.tip', 'core.address-info', 'core.address-history',
  'platform.addresses', 'platform.address-history', 'platform.identity-by-public-key-hash',
  'platform.identity-history', 'shielded.page',
]) {
  if (!protocolSource.includes(`operation: '${operation}'`)) throw new Error(`Recovery RPC is missing reviewed operation ${operation}.`);
}

const reviewedSource = `${allRecoverySources.map(({ text }) => text).join('\n')}\n${sourceFiles(resolve(root, 'packages/dash-network/src')).map(({ text }) => text).join('\n')}`;
for (const [pattern, label] of [
  [/\.(?:addressFundsTransfer|addressFundsWithdraw|addressFundingFromAssetLock|identityCreditWithdrawal|identityTopUpFromAddresses|identityTransferToAddresses|broadcastAndWait)\s*\(/u, 'low-level state-transition method'],
  [/\.addresses\s*\.\s*(?:transfer|withdraw|topUpIdentity|transferFromIdentity|fundFromAssetLock|createIdentity)\s*\(/u, 'write-capable address facade'],
  [/\.identities\s*\.\s*(?:create|creditTransfer|creditWithdrawal|topUp|update)\s*\(/u, 'write-capable identity facade'],
  [/\.stateTransitions\s*\.\s*(?:broadcast|broadcastAndWait)\s*\(/u, 'state-transition broadcast facade'],
]) {
  if (pattern.test(reviewedSource)) throw new Error(`Recovery source crosses its scan-only boundary through a ${label}.`);
}

const actual = createHash('sha256').update(html).digest('hex');
const recorded = readFileSync(checksumPath, 'utf8').trim().split(/\s+/u)[0];
if (actual !== recorded) throw new Error('Recovery SHA-256 sidecar does not match its HTML.');
console.log(`Verified sandboxed recovery artifact: ${actual}`);
