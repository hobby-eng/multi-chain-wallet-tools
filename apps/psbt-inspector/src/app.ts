import { BUILD_INFO } from '@ckd/build-info';
import { bytesToHex } from '@ckd/core/crypto.js';
import { decryptBip38Key } from './bip38-decryptor.js';
import { decodeDescriptor, type DecodedDescriptor } from './descriptor.js';
import { isRangedDescriptorKey, materializeDescriptorKey } from './descriptor-key.js';
import { buildDashCoreImport, type DashCoreImportArtifacts } from './dash-import.js';
import {
  buildConcreteMultisigWallet,
  buildRangedWallet,
  branchLabel,
  type ConcreteMultisigWallet,
  type MultisigBranch,
  type RangedWallet,
} from './multisig-wallet.js';
import { buildPolicy, policyHex, type LockKind } from './policy.js';
import { calculatePhrasePreimage, type HashlockKind } from './preimage.js';
import { describeScript, pairName, pairSummary, parsePsbt, transactionId, type ParsedPsbt, type PsbtChain, type PsbtNetwork } from './psbt.js';
import { decodeScript } from './script.js';
import { verifySignedMessage } from './message-verifier.js';
import { createPaymentQrAction } from '../../key-derivation/src/ui/payment-qr.js';

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`Missing required element #${id}.`);
  return element as T;
}

const modeButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-mode]')];
const inspectorPanel = required<HTMLElement>('inspector-panel');
const scriptPanel = required<HTMLElement>('script-panel');
const builderPanel = required<HTMLElement>('builder-panel');
const walletPanel = required<HTMLElement>('wallet-panel');
const verifyPanel = required<HTMLElement>('verify-panel');
const bip38Panel = required<HTMLElement>('bip38-panel');
const chainSelect = required<HTMLSelectElement>('psbt-chain');
const networkSelect = required<HTMLSelectElement>('psbt-network');
const psbtInput = required<HTMLTextAreaElement>('psbt-input');
const inspectButton = required<HTMLButtonElement>('inspect-button');
const clearButton = required<HTMLButtonElement>('clear-inspector');
const errorBox = required<HTMLDivElement>('psbt-error');
const results = required<HTMLElement>('psbt-results');
const summary = required<HTMLDivElement>('psbt-summary');
const transactionDetails = required<HTMLDivElement>('transaction-details');
const mapDetails = required<HTMLDivElement>('map-details');
const verifyChain = required<HTMLSelectElement>('verify-chain');
const verifyNetwork = required<HTMLSelectElement>('verify-network');
const verifyAddress = required<HTMLInputElement>('verify-address');
const verifyMessage = required<HTMLTextAreaElement>('verify-message');
const verifySignature = required<HTMLTextAreaElement>('verify-signature');
const verifyMessageButton = required<HTMLButtonElement>('verify-message-button');
const clearVerifierButton = required<HTMLButtonElement>('clear-verifier');
const verifyError = required<HTMLDivElement>('verify-error');
const verifyResults = required<HTMLElement>('verify-results');
const verifyValidity = required<HTMLElement>('verify-validity');
const verifyFormat = required<HTMLElement>('verify-format');
const verifyMagic = required<HTMLElement>('verify-magic');
const verifyRecoveredAddress = required<HTMLElement>('verify-recovered-address');
const verifyRecoveredKey = required<HTMLElement>('verify-recovered-key');
const verifyTimeConstraints = required<HTMLElement>('verify-time-constraints');
const bip38Chain = required<HTMLSelectElement>('bip38-chain');
const bip38Network = required<HTMLSelectElement>('bip38-network');
const bip38EncryptedKey = required<HTMLTextAreaElement>('bip38-encrypted-key');
const bip38Password = required<HTMLInputElement>('bip38-password');
const toggleBip38Password = required<HTMLButtonElement>('toggle-bip38-password');
const decryptBip38Button = required<HTMLButtonElement>('decrypt-bip38');
const clearBip38Button = required<HTMLButtonElement>('clear-bip38');
const bip38Error = required<HTMLElement>('bip38-error');
const bip38Progress = required<HTMLElement>('bip38-progress');
const bip38Results = required<HTMLElement>('bip38-results');
const bip38ResultList = required<HTMLElement>('bip38-result-list');
const toggleBip38Result = required<HTMLButtonElement>('toggle-bip38-result');
const scriptChain = required<HTMLSelectElement>('script-chain');
const scriptNetwork = required<HTMLSelectElement>('script-network');
const scriptRole = required<HTMLSelectElement>('script-role');
const scriptBranch = required<HTMLSelectElement>('script-branch');
const scriptWildcardIndex = required<HTMLInputElement>('script-wildcard-index');
const scriptInput = required<HTMLTextAreaElement>('script-input');
const decodeScriptButton = required<HTMLButtonElement>('decode-script');
const clearScriptButton = required<HTMLButtonElement>('clear-script');
const scriptError = required<HTMLDivElement>('script-error');
const scriptResults = required<HTMLElement>('script-results');
const scriptPolicy = required<HTMLElement>('script-policy');
const scriptAsm = required<HTMLElement>('script-asm');
const scriptClassification = required<HTMLElement>('script-classification');
const scriptWrappers = required<HTMLElement>('script-wrappers');
const scriptOperations = required<HTMLElement>('script-operations');
const preimagePhrase = required<HTMLInputElement>('preimage-phrase');
const togglePreimageVisibilityButton = required<HTMLButtonElement>('toggle-preimage-visibility');
const calculatePreimageButton = required<HTMLButtonElement>('calculate-preimage');
const clearPreimageButton = required<HTMLButtonElement>('clear-preimage');
const usePreimageBuilderButton = required<HTMLButtonElement>('use-preimage-builder');
const preimageError = required<HTMLDivElement>('preimage-error');
const preimageResults = required<HTMLElement>('preimage-results');
const preimageRaw = required<HTMLElement>('preimage-raw');
const preimageNormalized = required<HTMLElement>('preimage-normalized');
const preimageNormalization = required<HTMLElement>('preimage-normalization');
const preimageSha256 = required<HTMLElement>('preimage-sha256');
const preimageHash256 = required<HTMLElement>('preimage-hash256');
const preimageRipemd160 = required<HTMLElement>('preimage-ripemd160');
const preimageHash160 = required<HTMLElement>('preimage-hash160');
const builderChain = required<HTMLSelectElement>('builder-chain');
const builderNetwork = required<HTMLSelectElement>('builder-network');
const builderWrapper = required<HTMLSelectElement>('builder-wrapper');
const builderKeyOrder = required<HTMLSelectElement>('builder-key-order');
const policyMode = required<HTMLSelectElement>('policy-mode');
const requiredSignatures = required<HTMLInputElement>('required-signatures');
const publicKeys = required<HTMLTextAreaElement>('public-keys');
const publicKeysLabel = required<HTMLLabelElement>('public-keys-label');
const lockKind = required<HTMLSelectElement>('lock-kind');
const lockValueField = required<HTMLElement>('lock-value-field');
const lockValue = required<HTMLInputElement>('lock-value');
const timeUnitField = required<HTMLElement>('time-unit-field');
const timeUnit = required<HTMLSelectElement>('time-unit');
const recoveryKeyField = required<HTMLElement>('recovery-key-field');
const recoveryPublicKey = required<HTMLTextAreaElement>('recovery-public-key');
const recoveryRequiredField = required<HTMLElement>('recovery-required-field');
const recoveryRequired = required<HTMLInputElement>('recovery-required');
const secondLockField = required<HTMLElement>('second-lock-field');
const secondLockKind = required<HTMLSelectElement>('second-lock-kind');
const secondLockValue = required<HTMLInputElement>('second-lock-value');
const secondLockValueLabel = required<HTMLLabelElement>('second-lock-value-label');
const secondTimeUnit = required<HTMLSelectElement>('second-time-unit');
const emergencyKeyField = required<HTMLElement>('emergency-key-field');
const emergencyRequiredControl = required<HTMLElement>('emergency-required-control');
const emergencyPublicKeys = required<HTMLTextAreaElement>('emergency-public-keys');
const emergencyRequired = required<HTMLInputElement>('emergency-required');
const htlcHashField = required<HTMLElement>('htlc-hash-field');
const htlcHashKind = required<HTMLSelectElement>('htlc-hash-kind');
const htlcHashDigest = required<HTMLInputElement>('htlc-hash-digest');
const stagedDerivationField = required<HTMLElement>('staged-derivation-field');
const stagedMultipathChoice = required<HTMLSelectElement>('staged-multipath-choice');
const stagedWildcardIndex = required<HTMLInputElement>('staged-wildcard-index');
const customMiniscriptField = document.querySelector<HTMLElement>('#custom-miniscript-field');
const customMiniscriptContext = document.querySelector<HTMLSelectElement>('#custom-miniscript-context');
const customMiniscript = document.querySelector<HTMLTextAreaElement>('#custom-miniscript');
const presetPolicyFields = [...document.querySelectorAll<HTMLElement>('.preset-policy-field')];
const buildButton = required<HTMLButtonElement>('build-policy');
const builderCardinalityNote = required<HTMLElement>('builder-cardinality-note');
const builderError = required<HTMLDivElement>('builder-error');
const policyResults = required<HTMLElement>('policy-results');
const policyAddress = required<HTMLElement>('policy-address');
const policyThresholdRow = required<HTMLElement>('policy-threshold-row');
const policyThreshold = required<HTMLElement>('policy-threshold');
const policyRequirement = required<HTMLElement>('policy-requirement');
const policyCompatibility = required<HTMLElement>('policy-compatibility');
const policyDescriptor = required<HTMLElement>('policy-descriptor');
const policyMiniscript = required<HTMLElement>('policy-miniscript');
const policyMiniscriptAsm = required<HTMLElement>('policy-miniscript-asm');
const policyMiniscriptAnalysis = required<HTMLElement>('policy-miniscript-analysis');
const policyExpression = required<HTMLElement>('policy-expression');
const redeemScript = required<HTMLElement>('redeem-script');
const policyScriptPubKey = required<HTMLElement>('policy-script-pubkey');
const dashImportRow = required<HTMLElement>('dash-import-row');
const dashImportCommand = required<HTMLElement>('dash-import-command');
const dashGuiRow = required<HTMLElement>('dash-gui-row');
const dashGuiCommand = required<HTMLElement>('dash-gui-command');
const dashDescriptorRow = required<HTMLElement>('dash-descriptor-row');
const dashDescriptorCommand = required<HTMLElement>('dash-descriptor-command');
const dashImportWarning = required<HTMLElement>('dash-import-warning');
const downloadDashJson = required<HTMLButtonElement>('download-dash-json');
const walletChain = required<HTMLSelectElement>('wallet-chain');
const walletNetwork = required<HTMLSelectElement>('wallet-network');
const walletWrapper = required<HTMLSelectElement>('wallet-wrapper');
const walletOrder = required<HTMLSelectElement>('wallet-order');
const walletRequired = required<HTMLInputElement>('wallet-required');
const walletKeys = required<HTMLTextAreaElement>('wallet-keys');
const walletStartIndex = required<HTMLInputElement>('wallet-start-index');
const walletEndIndex = required<HTMLInputElement>('wallet-end-index');
const walletReceiveBranch = required<HTMLInputElement>('wallet-receive-branch');
const walletChangeBranch = required<HTMLInputElement>('wallet-change-branch');
const buildWalletButton = required<HTMLButtonElement>('build-wallet');
const clearWalletButton = required<HTMLButtonElement>('clear-wallet');
const walletError = required<HTMLDivElement>('wallet-error');
const walletResults = required<HTMLElement>('wallet-results');
const walletDescriptors = required<HTMLElement>('wallet-descriptors');
const walletImportText = required<HTMLElement>('wallet-import-text');
const walletImportJson = required<HTMLElement>('wallet-import-json');
const walletDerivationDetails = required<HTMLElement>('wallet-derivation-details');
const walletAddressRows = required<HTMLElement>('wallet-address-rows');
const walletBasicMode = required<HTMLButtonElement>('wallet-mode-basic');
const walletAdvancedMode = required<HTMLButtonElement>('wallet-mode-advanced');
const walletReceiveTab = required<HTMLButtonElement>('wallet-receive-tab');
const walletChangeTab = required<HTMLButtonElement>('wallet-change-tab');
const walletBranchTabs = required<HTMLElement>('wallet-branch-tabs');
const walletAdvancedOutput = required<HTMLElement>('wallet-advanced-output');
const walletSelectedCount = required<HTMLElement>('wallet-selected-count');
const walletExportFormat = required<HTMLSelectElement>('wallet-export-format');
const walletCopyAddresses = required<HTMLButtonElement>('wallet-copy-addresses');
const walletCopyPublicKeys = required<HTMLButtonElement>('wallet-copy-public-keys');
const walletCopySelected = required<HTMLButtonElement>('wallet-copy-selected');
const walletCopyAllDisplayed = required<HTMLButtonElement>('wallet-copy-all-displayed');
const walletDownloadSelected = required<HTMLButtonElement>('wallet-download-selected');
const walletSelectAll = required<HTMLButtonElement>('wallet-select-all');
const walletSelectNone = required<HTMLButtonElement>('wallet-select-none');
const walletSelectInvert = required<HTMLButtonElement>('wallet-select-invert');
let dashImportArtifacts: DashCoreImportArtifacts | null = null;
type WalletBuild = ConcreteMultisigWallet | RangedWallet;
let currentWallet: WalletBuild | null = null;
let walletDetailMode: 'basic' | 'advanced' = 'basic';
let activeWalletBranch: MultisigBranch = 0;
let selectedWalletRows = new Set<string>();
let pendingWalletBuild: number | null = null;
let bip38DecryptRevision = 0;
let bip38ResultsRevealed = false;

function chain(): PsbtChain { return chainSelect.value === 'dash' ? 'dash' : 'bitcoin'; }
function selectedNetwork(select: HTMLSelectElement, selectedChain: PsbtChain): PsbtNetwork {
  if (selectedChain === 'bitcoin' && select.value === 'regtest') return 'regtest';
  return select.value === 'testnet' ? 'testnet' : 'mainnet';
}
function network(): PsbtNetwork { return selectedNetwork(networkSelect, chain()); }

function syncNetworkChoice(chainControl: HTMLSelectElement, networkControl: HTMLSelectElement): void {
  const regtest = networkControl.querySelector<HTMLOptionElement>('option[value="regtest"]');
  const dash = chainControl.value === 'dash';
  if (regtest !== null) regtest.disabled = dash;
  if (dash && networkControl.value === 'regtest') networkControl.value = 'testnet';
}

function setBip38ResultVisibility(revealed: boolean): void {
  bip38ResultsRevealed = revealed;
  for (const input of bip38ResultList.querySelectorAll<HTMLInputElement>('[data-bip38-secret]')) {
    input.type = revealed ? 'text' : 'password';
  }
  for (const button of bip38ResultList.querySelectorAll<HTMLButtonElement>('[data-copy-bip38-secret]')) {
    button.disabled = !revealed;
  }
  toggleBip38Result.textContent = revealed ? 'Hide private keys' : 'Reveal private keys';
  toggleBip38Result.setAttribute('aria-pressed', String(revealed));
}

function clearBip38Decryptor(): void {
  bip38DecryptRevision += 1;
  bip38EncryptedKey.value = '';
  bip38Password.value = '';
  bip38Password.type = 'password';
  toggleBip38Password.textContent = 'Show';
  toggleBip38Password.setAttribute('aria-pressed', 'false');
  bip38ResultList.replaceChildren();
  setBip38ResultVisibility(false);
  toggleBip38Result.disabled = true;
  bip38Results.hidden = true;
  bip38Error.hidden = true;
  bip38Progress.hidden = true;
  decryptBip38Button.disabled = false;
  decryptBip38Button.textContent = 'Decrypt keys';
}

function appendBip38Decryption(
  position: number,
  decrypted: Awaited<ReturnType<typeof decryptBip38Key>>,
): void {
  const card = document.createElement('article');
  card.className = 'bip38-result-card';
  card.append(textElement('h3', '', `Recovered key #${position}`));

  const addressRow = document.createElement('div');
  addressRow.className = 'policy-row';
  const address = textElement('code', '', decrypted.address);
  const copyAddress = textElement('button', 'secondary compact', 'Copy') as HTMLButtonElement;
  copyAddress.type = 'button';
  copyAddress.addEventListener('click', () => { void copyPlainText(decrypted.address); });
  addressRow.append(textElement('span', '', 'Verified P2PKH address'), address, copyAddress);

  const compressionRow = document.createElement('div');
  compressionRow.className = 'policy-row';
  compressionRow.append(
    textElement('span', '', 'Public-key encoding'),
    textElement('code', '', decrypted.compressed ? 'Compressed public key' : 'Uncompressed public key'),
  );

  const secretOutput = (label: string, value: string, copyLabel: string): HTMLElement => {
    const row = document.createElement('div');
    row.className = 'bip38-secret-output';
    const input = document.createElement('input');
    input.type = bip38ResultsRevealed ? 'text' : 'password';
    input.readOnly = true;
    input.value = value;
    input.dataset.bip38Secret = 'true';
    const copy = textElement('button', 'secondary compact', copyLabel) as HTMLButtonElement;
    copy.type = 'button';
    copy.disabled = !bip38ResultsRevealed;
    copy.dataset.copyBip38Secret = 'true';
    copy.addEventListener('click', () => { void copyPlainText(value); });
    row.append(textElement('label', '', label), input, copy);
    return row;
  };

  card.append(
    addressRow,
    compressionRow,
    secretOutput('Private key · WIF', decrypted.wif, 'Copy WIF'),
    secretOutput('Private key · hexadecimal', decrypted.privateKeyHex, 'Copy hex'),
  );
  bip38ResultList.append(card);
}

function appendBip38Failure(position: number, error: unknown): void {
  const card = document.createElement('article');
  card.className = 'bip38-result-card bip38-result-error';
  card.append(
    textElement('h3', '', `Key #${position} could not be decrypted`),
    textElement('p', '', error instanceof Error ? error.message : String(error)),
  );
  bip38ResultList.append(card);
}

async function decryptSelectedBip38Key(): Promise<void> {
  bip38Error.hidden = true;
  bip38Progress.hidden = true;
  bip38ResultList.replaceChildren();
  setBip38ResultVisibility(false);
  toggleBip38Result.disabled = true;
  const keys = [...new Set(bip38EncryptedKey.value.split(/[\s,;]+/u).map((value) => value.trim()).filter(Boolean))];
  if (keys.length === 0) {
    bip38Error.textContent = 'Enter at least one BIP38 encrypted private key.';
    bip38Error.hidden = false;
    return;
  }
  if (keys.length > 200) {
    bip38Error.textContent = 'Decrypt at most 200 BIP38 keys in one batch.';
    bip38Error.hidden = false;
    return;
  }
  if (bip38Password.value.length === 0) {
    bip38Error.textContent = 'Enter the BIP38 password.';
    bip38Error.hidden = false;
    return;
  }
  decryptBip38Button.disabled = true;
  decryptBip38Button.textContent = 'Decrypting…';
  const revision = ++bip38DecryptRevision;
  const password = bip38Password.value;
  bip38Results.hidden = false;
  let succeeded = 0;
  let failed = 0;
  try {
    const selectedChain = bip38Chain.value === 'dash' ? 'dash' : 'bitcoin';
    const networkName = bip38Network.value === 'mainnet' ? 'mainnet' : 'testnet';
    for (const [index, key] of keys.entries()) {
      if (revision !== bip38DecryptRevision) return;
      bip38Progress.textContent = `Decrypting ${index + 1} of ${keys.length}…`;
      bip38Progress.hidden = false;
      try {
        const decrypted = await decryptBip38Key(key, password, selectedChain, networkName);
        if (revision !== bip38DecryptRevision) return;
        appendBip38Decryption(index + 1, decrypted);
        succeeded += 1;
        toggleBip38Result.disabled = false;
      } catch (error) {
        if (revision !== bip38DecryptRevision) return;
        appendBip38Failure(index + 1, error);
        failed += 1;
      }
    }
    bip38Password.value = '';
    bip38Password.type = 'password';
    toggleBip38Password.textContent = 'Show';
    toggleBip38Password.setAttribute('aria-pressed', 'false');
    bip38Progress.textContent = `Finished ${keys.length} keys · ${succeeded} recovered${failed === 0 ? '' : ` · ${failed} failed`}.`;
  } catch (error) {
    bip38Error.textContent = error instanceof Error ? error.message : String(error);
    bip38Error.hidden = false;
  } finally {
    if (revision === bip38DecryptRevision) {
      decryptBip38Button.disabled = false;
      decryptBip38Button.textContent = 'Decrypt keys';
    }
  }
}

function textElement(tag: keyof HTMLElementTagNameMap, className: string, text: string): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

function detailRows(rows: readonly (readonly [string, string])[]): HTMLDListElement {
  const list = document.createElement('dl');
  list.className = 'psbt-detail-list';
  for (const [label, value] of rows) {
    list.append(textElement('dt', '', label), textElement('dd', '', value));
  }
  return list;
}

function stat(label: string, value: string): HTMLElement {
  const element = document.createElement('div');
  element.className = 'psbt-stat';
  element.append(textElement('span', 'psbt-stat-label', label), textElement('code', 'psbt-stat-value', value));
  return element;
}

function amount(value: bigint, selectedChain: PsbtChain): string {
  const whole = value / 100_000_000n;
  const fraction = (value % 100_000_000n).toString().padStart(8, '0');
  return `${whole}.${fraction} ${selectedChain === 'dash' ? 'DASH' : 'BTC'} (${value} ${selectedChain === 'dash' ? 'duffs' : 'sat'})`;
}

function v2OutputScript(parsed: ParsedPsbt, index: number): Uint8Array | null {
  if (parsed.transaction !== null) return parsed.transaction.outputs[index]?.script ?? null;
  return parsed.outputs[index]?.find((item) => item.type === 4n && item.keyData.length === 0)?.value ?? null;
}

function renderMaps(
  title: string,
  scope: 'global' | 'input' | 'output',
  maps: readonly (readonly import('./psbt.js').PsbtPair[])[],
  chain: PsbtChain,
  selectedNetwork: PsbtNetwork,
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'psbt-map-section';
  section.append(textElement('h3', '', title));
  maps.forEach((map, index) => {
    const details = document.createElement('details');
    if (maps.length === 1) details.open = true;
    const heading = document.createElement('summary');
    heading.textContent = scope === 'global' ? `${map.length} key-value records` : `${scope === 'input' ? 'Input' : 'Output'} ${index} · ${map.length} records`;
    details.append(heading);
    if (map.length === 0) {
      details.append(textElement('p', 'field-note', 'No PSBT metadata supplied.'));
      section.append(details);
      return;
    }
    const table = document.createElement('div');
    table.className = 'psbt-map-table';
    for (const item of map) {
      const valueHex = bytesToHex(item.value);
      const rows: [string, string][] = [
        ['Field', pairName(scope, item.type, chain)],
        ['Type', `0x${item.type.toString(16)}`],
        ['Key data', item.keyData.length === 0 ? '—' : bytesToHex(item.keyData)],
        ['Value', valueHex.length === 0 ? '—' : valueHex],
      ];
      const interpretation = pairSummary(scope, item, chain);
      if (interpretation !== null) rows.splice(2, 0, ['Interpretation', interpretation]);
      const isInputScript = scope === 'input' && (item.type === 0x04n || item.type === 0x05n);
      const isOutputScript = scope === 'output' && (item.type === 0x00n || item.type === 0x01n);
      if (isInputScript || isOutputScript) {
        try {
          const decoded = decodeScript(bytesToHex(item.value), chain, selectedNetwork, 'spending');
          rows.splice(2, 0, ['Recognized script policy', decoded.inferredPolicy], ['Script ASM', decoded.asm]);
        } catch (error) {
          rows.splice(2, 0, ['Script decoding error', error instanceof Error ? error.message : String(error)]);
        }
      }
      table.append(detailRows(rows));
    }
    details.append(table);
    section.append(details);
  });
  return section;
}

function inputMapCount(parsed: ParsedPsbt, types: readonly bigint[]): number {
  return parsed.inputs.filter((map) => map.some((item) => types.includes(item.type))).length;
}

function signingState(parsed: ParsedPsbt): string {
  const finalized = inputMapCount(parsed, [0x07n, 0x08n]);
  if (parsed.inputs.length > 0 && finalized === parsed.inputs.length) return 'Final scripts supplied for all inputs';
  const signed = inputMapCount(parsed, [0x02n, 0x07n, 0x08n, 0x13n, 0x14n, 0x1cn]);
  if (signed > 0) return `Signature or final-script data supplied for ${signed}/${parsed.inputs.length} inputs`;
  return 'Unsigned · no signatures or final scripts supplied';
}

function utxoState(parsed: ParsedPsbt): string {
  const known = parsed.inputValues.filter((value) => value !== null).length;
  if (known === 0) return `Missing for all ${parsed.inputs.length} inputs`;
  if (known === parsed.inputs.length) return `Supplied for all ${parsed.inputs.length} inputs`;
  return `Supplied for ${known}/${parsed.inputs.length} inputs`;
}

function signerMetadata(parsed: ParsedPsbt): string {
  const origins = inputMapCount(parsed, [0x06n, 0x16n]);
  return origins === 0
    ? 'No BIP32 key origins supplied; an external signer may still recognize its keys independently'
    : `BIP32 key origins supplied for ${origins}/${parsed.inputs.length} inputs`;
}

function outputAsm(script: Uint8Array, chain: PsbtChain, network: PsbtNetwork): string {
  try {
    return decodeScript(bytesToHex(script), chain, network, 'script-pubkey').asm;
  } catch (error) {
    return `Unable to decode ASM: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function render(parsed: ParsedPsbt): void {
  const selectedNetwork = network();
  const knownInputCount = parsed.inputValues.filter((value) => value !== null).length;
  results.hidden = false;
  summary.replaceChildren(
    stat('Chain parser', parsed.chain === 'dash' ? 'Dash Core' : 'Bitcoin'),
    stat('PSBT version', `v${parsed.version}`),
    stat('Inputs', parsed.inputs.length.toString()),
    stat('Outputs', parsed.outputs.length.toString()),
    stat('Supplied input values', `${knownInputCount}/${parsed.inputs.length}`),
    stat('Signing state', signingState(parsed)),
    stat('UTXO information', utxoState(parsed)),
    stat('Signer metadata', signerMetadata(parsed)),
  );
  const cards: HTMLElement[] = [];
  cards.push(
    textElement('h3', 'psbt-subheading', 'Transaction accounting'),
    textElement('p', 'field-note', 'Amounts come from supplied UTXOs. This inspection does not verify blockchain inclusion, every script commitment, or transaction signatures.'),
    detailRows([
      ['Supplied input total', knownInputCount === parsed.inputs.length
        ? amount(parsed.inputValues.reduce<bigint>((total, value) => total + (value ?? 0n), 0n), parsed.chain)
        : `Unavailable · values missing for ${parsed.inputs.length - knownInputCount} input(s)`],
      ['Output total', amount(parsed.outputValues.reduce((total, value) => total + value, 0n), parsed.chain)],
      ['Fee from supplied UTXOs (not chain-verified)', parsed.fee === null ? 'Unavailable · one or more input values are missing' : amount(parsed.fee, parsed.chain)],
    ]),
  );
  if (parsed.transaction !== null) {
    cards.push(textElement('h3', 'psbt-subheading', 'Unsigned transaction'));
    const serializedSize = parsed.transaction.raw.length;
    cards.push(detailRows([
      ['Transaction ID', parsed.chain === 'dash' && parsed.transaction.dashType !== 0
        ? 'Unavailable from the special-transaction PSBT encoding alone'
        : transactionId(parsed.transaction.raw)],
      ['Serialized size', `${serializedSize} bytes`],
      ['Virtual size', `${serializedSize} vB (unsigned transaction has no witness data)`],
      ['Weight', `${serializedSize * 4} WU`],
      ['Transaction version', parsed.transaction.version.toString()],
      ['Dash transaction type', parsed.transaction.dashType === null ? 'Not applicable' : parsed.transaction.dashType.toString()],
      ['Witness serialization', parsed.transaction.hasWitness ? 'Present' : 'Not present'],
      ['Locktime', parsed.transaction.lockTime.toString()],
      ['Special payload', parsed.transaction.extraPayload === null ? 'None' : bytesToHex(parsed.transaction.extraPayload)],
    ]));
    parsed.transaction.inputs.forEach((input, index) => {
      const card = document.createElement('article');
      card.className = 'psbt-entry-card';
      card.append(textElement('h4', '', `Input ${index}`), detailRows([
        ['Previous output', `${input.txid}:${input.vout}`],
        ['Sequence', `0x${input.sequence.toString(16).padStart(8, '0')} (${input.sequence})`],
        ['Input value', parsed.inputValues[index] === null || parsed.inputValues[index] === undefined ? 'Not supplied' : amount(parsed.inputValues[index], parsed.chain)],
      ]));
      cards.push(card);
    });
  }
  parsed.outputValues.forEach((value, index) => {
    const script = v2OutputScript(parsed, index);
    const description = script === null ? null : describeScript(script, parsed.chain, selectedNetwork);
    const card = document.createElement('article');
    card.className = 'psbt-entry-card psbt-output-card';
    card.append(textElement('h4', '', `Output ${index}`), detailRows([
      ['Amount', amount(value, parsed.chain)],
      ['Type', description?.type ?? 'Script not supplied'],
      ['Address', description?.address ?? '—'],
      ['scriptPubKey ASM', script === null ? '—' : outputAsm(script, parsed.chain, selectedNetwork)],
      ['scriptPubKey', script === null ? '—' : bytesToHex(script)],
    ]));
    cards.push(card);
  });
  transactionDetails.replaceChildren(...cards);
  mapDetails.replaceChildren(
    renderMaps('Global map', 'global', [parsed.global], parsed.chain, selectedNetwork),
    renderMaps('Input maps', 'input', parsed.inputs, parsed.chain, selectedNetwork),
    renderMaps('Output maps', 'output', parsed.outputs, parsed.chain, selectedNetwork),
  );
}

function inspect(): void {
  errorBox.hidden = true;
  results.hidden = true;
  try { render(parsePsbt(psbtInput.value, chain())); }
  catch (error) {
    errorBox.textContent = error instanceof Error ? error.message : String(error);
    errorBox.hidden = false;
  }
}

let verificationRevision = 0;
function invalidateVerification(): void {
  verificationRevision += 1;
  verifyResults.hidden = true;
  verifyError.hidden = true;
}
for (const control of [verifyAddress, verifyMessage, verifySignature, verifyChain, verifyNetwork]) {
  control.addEventListener('input', invalidateVerification);
  control.addEventListener('change', invalidateVerification);
}
async function verifyMessageSignature(): Promise<void> {
  const revision = ++verificationRevision;
  verifyError.hidden = true;
  verifyResults.hidden = true;
  try {
    const verification = await verifySignedMessage(
      verifyAddress.value,
      verifyMessage.value,
      verifySignature.value,
      verifyChain.value === 'dash' ? 'dash' : 'bitcoin',
      selectedNetwork(verifyNetwork, verifyChain.value === 'dash' ? 'dash' : 'bitcoin'),
    );
    if (revision !== verificationRevision) return;
    verifyValidity.textContent = verification.valid
      ? 'VALID · the signature satisfies the claimed address and exact message'
      : 'INVALID · the signature does not satisfy the claimed address and exact message';
    verifyFormat.textContent = verification.format;
    verifyMagic.textContent = verification.messageMagic;
    verifyRecoveredAddress.textContent = verification.recoveredAddress ?? verifyAddress.value.trim();
    verifyRecoveredKey.textContent = verification.recoveredPublicKey ?? 'Not exposed by this BIP-322 proof';
    verifyTimeConstraints.textContent = verification.timeConstraints;
    verifyResults.hidden = false;
  } catch (error) {
    if (revision !== verificationRevision) return;
    verifyError.textContent = error instanceof Error ? error.message : String(error);
    verifyError.hidden = false;
  }
}

function inspectScript(): void {
  scriptError.hidden = true;
  scriptResults.hidden = true;
  try {
    const compactInput = scriptInput.value.trim().replaceAll(/\s+/gu, '');
    const looksLikeDescriptor = /[()#]/u.test(compactInput);
    if (looksLikeDescriptor) {
      const descriptor = decodeDescriptor(scriptInput.value, {
        chain: scriptChain.value === 'dash' ? 'dash' : 'bitcoin',
        network: selectedNetwork(scriptNetwork, scriptChain.value === 'dash' ? 'dash' : 'bitcoin'),
        multipathChoice: scriptBranch.value === '1' ? 1 : 0,
        wildcardIndex: Number(scriptWildcardIndex.value),
      });
      scriptPolicy.textContent = descriptor.spendingPaths.length === 0 ? descriptor.summary : descriptor.spendingPaths.join('\n');
      scriptAsm.textContent = descriptor.compiledOutput?.asm ?? 'This descriptor is structurally decoded, but concrete compilation is not implemented for this descriptor family.';
      scriptClassification.textContent = `${descriptor.classification} · checksum ${descriptor.checksum} · ${descriptor.ranged ? 'ranged (*)' : 'fixed'}`;
      scriptWrappers.replaceChildren(renderDescriptorVisualization(descriptor));
      scriptOperations.replaceChildren(textElement('h3', 'psbt-subheading', 'Descriptor structure'), detailRows(descriptor.rows.map((row) => [row.label, row.value] as const)));
      scriptResults.hidden = false;
      return;
    }

    function renderDescriptorVisualization(descriptor: DecodedDescriptor): HTMLElement {
      const root = document.createElement('section');
      root.className = 'descriptor-visualization';
      if (descriptor.compiledOutput !== null) {
        root.append(
          textElement('h3', 'psbt-subheading', 'Compiled descriptor data'),
          detailRows(descriptor.compiledOutput.rows.map((row) => [row.label, row.value] as const)),
        );
      }
      if (descriptor.pathCards.length > 0) {
        root.append(textElement('h3', 'psbt-subheading', 'Policy · spending paths'));
        const cards = document.createElement('div');
        cards.className = 'descriptor-path-cards';
        descriptor.pathCards.forEach((path) => {
          const card = document.createElement('article');
          card.className = 'descriptor-path-card';
          card.append(
            textElement('h4', '', path.title),
            detailRows([
              ['Availability', path.availability],
              ['Requirement', path.requirement],
              ['Keys', path.keys.length === 0 ? 'No direct signing key summarized' : path.keys.join('\n')],
              ['Preimage', path.preimages.length === 0 ? 'Not required' : path.preimages.join('\n')],
              ['Locks', path.locks.length === 0 ? 'None' : path.locks.join('\n')],
            ]),
          );
          cards.append(card);
        });
        root.append(cards);
      }
      if (descriptor.policyTree.length > 0) {
        root.append(textElement('h3', 'psbt-subheading', 'Policy tree'), textElement('pre', 'policy-tree', descriptor.policyTree.join('\n')));
      }
      root.append(textElement('h3', 'psbt-subheading', 'Technical analysis'));
      return root;
    }
    const decoded = decodeScript(
      scriptInput.value,
      scriptChain.value === 'dash' ? 'dash' : 'bitcoin',
      selectedNetwork(scriptNetwork, scriptChain.value === 'dash' ? 'dash' : 'bitcoin'),
      scriptRole.value === 'script-pubkey' ? 'script-pubkey' : 'spending',
    );
    scriptPolicy.textContent = decoded.inferredPolicy;
    scriptAsm.textContent = decoded.asm;
    scriptClassification.textContent = `${decoded.classification}${decoded.directAddress === null ? '' : ` · ${decoded.directAddress}`} · ${decoded.byteLength} bytes`;
    scriptWrappers.replaceChildren(...decoded.wrappers.map((wrapper) => {
      const row = document.createElement('div');
      row.className = 'policy-row';
      row.append(textElement('span', '', wrapper.label), textElement('code', '', `${wrapper.address} · scriptPubKey ${wrapper.scriptPubKey}`));
      return row;
    }));
    const operationRows = decoded.operations.map((operation) => [
      `Byte ${operation.offset}`,
      `${operation.data === null ? operation.name : `${operation.name} · ${operation.data}`} — ${operation.meaning}`,
    ] as const);
    const operationHeading = textElement('h3', 'psbt-subheading', 'Operations');
    scriptOperations.replaceChildren(operationHeading, detailRows(operationRows));
    scriptResults.hidden = false;
  } catch (error) {
    scriptError.textContent = error instanceof Error ? error.message : String(error);
    scriptError.hidden = false;
  }
}

function syncBuilderControls(): void {
  const custom = policyMode.value === 'custom-miniscript';
  if (custom) builderChain.value = 'bitcoin';
  builderChain.disabled = custom;
  builderWrapper.disabled = builderChain.value === 'dash';
  if (builderChain.value === 'dash') builderWrapper.value = 'p2sh';
  const primaryCount = publicKeys.value.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean).length;
  const musig2 = !custom && builderWrapper.value === 'p2tr-musig2';
  if (musig2) {
    policyMode.value = 'locked-multisig';
    lockKind.value = 'none';
  }
  policyMode.disabled = musig2;
  lockKind.disabled = musig2;
  builderKeyOrder.disabled = musig2;
  const sortedOption = builderKeyOrder.querySelector<HTMLOptionElement>('option[value="bip67"]');
  const suppliedOption = builderKeyOrder.querySelector<HTMLOptionElement>('option[value="supplied"]');
  if (sortedOption !== null) sortedOption.textContent = builderWrapper.value === 'p2tr'
    ? 'Lexicographic x-only order · multi_a()'
    : builderWrapper.value === 'p2tr-musig2'
      ? 'BIP327 KeySort · required'
      : 'BIP67 sorted · sortedmulti()';
  if (suppliedOption !== null) suppliedOption.textContent = builderWrapper.value === 'p2tr'
    ? 'Supplied x-only order · multi_a()'
    : 'Supplied order · multi()';
  if (musig2) builderKeyOrder.value = 'bip67';
  presetPolicyFields.forEach((field) => { field.hidden = custom; });
  if (customMiniscriptField !== null) customMiniscriptField.hidden = !custom;
  const selectedMode = policyMode.value;
  const noLock = lockKind.value === 'none';
  lockValueField.hidden = noLock;
  timeUnitField.hidden = lockKind.value !== 'relative-time';
  recoveryKeyField.hidden = selectedMode === 'locked-multisig';
  recoveryRequiredField.hidden = selectedMode !== 'delayed-recovery-multisig' && selectedMode !== 'backup-committee' && selectedMode !== 'escalating-recovery';
  recoveryRequiredField.hidden = !['htlc', 'delayed-recovery-multisig', 'backup-committee', 'escalating-recovery', 'decaying-multisig', 'expanding-multisig'].includes(selectedMode);
  secondLockField.hidden = selectedMode !== 'escalating-recovery' && selectedMode !== 'staged-recovery';
  emergencyKeyField.hidden = selectedMode !== 'escalating-recovery' && selectedMode !== 'staged-recovery';
  emergencyRequiredControl.hidden = selectedMode === 'staged-recovery';
  const stagedRecovery = selectedMode === 'staged-recovery';
  requiredSignatures.disabled = stagedRecovery || musig2;
  if (stagedRecovery) requiredSignatures.value = '1';
  if (musig2) requiredSignatures.value = String(Math.max(1, primaryCount));
  publicKeysLabel.textContent = stagedRecovery
    ? 'Primary compressed public key · exactly one'
    : musig2
      ? 'MuSig2 participant compressed public keys · one per line, all must sign'
      : builderWrapper.value === 'p2tr'
        ? 'Compressed public keys · converted to x-only for Tapscript'
    : 'Compressed public keys · one per line, in committed order';
  required<HTMLLabelElement>('emergency-public-keys-label').textContent = selectedMode === 'staged-recovery'
    ? 'Second delayed recovery compressed public key'
    : 'Emergency compressed public keys · one per line';
  required<HTMLLabelElement>('emergency-required-label').textContent = selectedMode === 'staged-recovery'
    ? 'Second recovery required signatures'
    : 'Emergency required signatures';
  htlcHashField.hidden = selectedMode !== 'htlc';
  stagedDerivationField.hidden = selectedMode !== 'staged-recovery';
  if (custom) {
    lockValueField.hidden = true;
    timeUnitField.hidden = true;
    recoveryKeyField.hidden = true;
    recoveryRequiredField.hidden = true;
    secondLockField.hidden = true;
    emergencyKeyField.hidden = true;
    htlcHashField.hidden = true;
    stagedDerivationField.hidden = true;
  }
  required<HTMLLabelElement>('recovery-public-key-label').textContent = selectedMode === 'staged-recovery'
    ? 'First delayed recovery compressed public key'
    : selectedMode === 'htlc'
    ? 'Timelocked fallback compressed public keys · one per line'
    : selectedMode === 'delayed-recovery'
    ? 'Recovery compressed public key'
    : selectedMode === 'backup-committee'
      ? 'Backup committee compressed public keys · one per line'
      : selectedMode === 'expanding-multisig'
        ? 'Additional expansion compressed public keys · one per line'
      : 'Recovery compressed public keys · one per line';
  if (selectedMode === 'decaying-multisig') recoveryKeyField.hidden = true;
  const labels: Record<string, string> = {
    height: 'Absolute block height', time: 'Unix locktime', 'relative-blocks': 'Delay in blocks', 'relative-time': 'Delay amount', none: 'Lock value',
  };
  required<HTMLLabelElement>('lock-value-label').textContent = labels[lockKind.value] ?? 'Lock value';
  secondLockValueLabel.textContent = `Second ${labels[secondLockKind.value]?.toLowerCase() ?? 'lock value'}`;
  secondTimeUnit.hidden = secondLockKind.value !== 'relative-time';
  const singleRecovery = selectedMode === 'delayed-recovery' || stagedRecovery;
  const recoveryCount = recoveryPublicKey.value.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean).length;
  const emergencyCount = emergencyPublicKeys.value.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean).length;
  publicKeys.setCustomValidity(stagedRecovery && primaryCount > 1 ? 'Staged recovery accepts exactly one primary key.' : '');
  recoveryPublicKey.setCustomValidity(singleRecovery && recoveryCount > 1 ? 'This recovery branch accepts exactly one key.' : '');
  emergencyPublicKeys.setCustomValidity(stagedRecovery && emergencyCount > 1 ? 'Staged recovery accepts exactly one second recovery key.' : '');
  const tooManyKeys = (stagedRecovery && (primaryCount > 1 || emergencyCount > 1)) || (singleRecovery && recoveryCount > 1);
  buildButton.disabled = tooManyKeys;
  builderCardinalityNote.textContent = musig2
    ? 'MuSig2 creates one aggregate Taproot key and one cooperative Schnorr signature. Every listed participant must sign; this is N-of-N and has no Tapscript fallback.'
    : stagedRecovery
    ? 'Staged recovery is fixed to three 1-of-1 branches: one primary key, one first recovery key, and one second recovery key. Additional key lines are not accepted.'
    : selectedMode === 'delayed-recovery'
      ? 'The delayed recovery branch accepts exactly one recovery key; the immediate primary branch may remain M-of-N.'
      : selectedMode === 'decaying-multisig'
        ? 'Both branches use the same primary key set; only the required signature count decreases after the lock.'
        : 'Thresholds are validated against the number of keys supplied for each branch.';
}

function normalizedLockValue(): number {
  const value = Number(lockValue.value);
  if (lockKind.value !== 'relative-time') return value;
  const multipliers: Record<string, number> = { seconds: 1, minutes: 60, hours: 3_600, days: 86_400, months: 2_592_000 };
  return value * (multipliers[timeUnit.value] ?? 1);
}

function normalizedSecondLockValue(): number {
  const value = Number(secondLockValue.value);
  if (secondLockKind.value !== 'relative-time') return value;
  const multipliers: Record<string, number> = { seconds: 1, minutes: 60, hours: 3_600, days: 86_400, months: 2_592_000 };
  return value * (multipliers[secondTimeUnit.value] ?? 1);
}

function downloadText(filename: string, value: string, type: string): void {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function copyPlainText(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
}

function calculatePreimage(): void {
  preimageError.hidden = true;
  preimageResults.hidden = true;
  usePreimageBuilderButton.hidden = true;
  try {
    const result = calculatePhrasePreimage(preimagePhrase.value);
    preimageRaw.textContent = `${result.rawByteLength} bytes · ${result.rawUtf8Hex}`;
    preimageNormalized.textContent = result.preimageHex;
    preimageNormalization.textContent = result.normalization;
    preimageSha256.textContent = result.commitments.sha256;
    preimageHash256.textContent = result.commitments.hash256;
    preimageRipemd160.textContent = result.commitments.ripemd160;
    preimageHash160.textContent = result.commitments.hash160;
    preimageResults.hidden = false;
    usePreimageBuilderButton.hidden = false;
  } catch (error) {
    preimageError.textContent = error instanceof Error ? error.message : String(error);
    preimageError.hidden = false;
  }
}

function buildSelectedPolicy(): void {
  builderError.hidden = true;
  policyResults.hidden = true;
  try {
    const enteredKeys = publicKeys.value.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean);
    const enteredRecoveryKeys = recoveryPublicKey.value.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean);
    const enteredEmergencyKeys = emergencyPublicKeys.value.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean);
    const network = selectedNetwork(builderNetwork, builderChain.value === 'dash' ? 'dash' : 'bitcoin');
    const stagedRanged = policyMode.value === 'staged-recovery'
      && [...enteredKeys, ...enteredRecoveryKeys, ...enteredEmergencyKeys].some(isRangedDescriptorKey);
    const materialize = (value: string): string => materializeDescriptorKey(
      value,
      network,
      stagedMultipathChoice.value === '1' ? 1 : 0,
      Number(stagedWildcardIndex.value),
    );
    const keys = stagedRanged ? enteredKeys.map(materialize) : enteredKeys;
    const recoveryKeys = stagedRanged ? enteredRecoveryKeys.map(materialize) : enteredRecoveryKeys;
    const emergencyKeys = stagedRanged ? enteredEmergencyKeys.map(materialize) : enteredEmergencyKeys;
    const stagedDescriptorKeys = stagedRanged ? {
      primary: enteredKeys[0] ?? '',
      recovery: enteredRecoveryKeys[0] ?? '',
      emergency: enteredEmergencyKeys[0] ?? '',
    } : null;
    const policy = buildPolicy({
      chain: builderChain.value === 'dash' ? 'dash' : 'bitcoin',
      network,
      required: Number(requiredSignatures.value),
      publicKeys: keys,
      keyOrder: builderKeyOrder.value === 'bip67' ? 'bip67' : 'supplied',
      lockKind: lockKind.value as LockKind,
      lockValue: normalizedLockValue(),
      bitcoinWrapper: builderWrapper.value === 'p2sh'
        ? 'p2sh'
        : builderWrapper.value === 'p2tr'
          ? 'p2tr'
          : builderWrapper.value === 'p2tr-musig2'
            ? 'p2tr-musig2'
            : 'p2wsh',
      mode: policyMode.value === 'delayed-recovery'
        ? 'delayed-recovery'
        : policyMode.value === 'delayed-recovery-multisig'
          ? 'delayed-recovery-multisig'
          : policyMode.value === 'backup-committee'
            ? 'backup-committee'
            : policyMode.value === 'decaying-multisig'
              ? 'decaying-multisig'
              : policyMode.value === 'expanding-multisig'
                ? 'expanding-multisig'
                : policyMode.value === 'escalating-recovery'
                  ? 'escalating-recovery'
                  : policyMode.value === 'staged-recovery'
                    ? 'staged-recovery'
                    : policyMode.value === 'htlc'
                      ? 'htlc'
                      : policyMode.value === 'custom-miniscript' ? 'custom-miniscript' : 'locked-multisig',
      recoveryPublicKey: recoveryKeys[0] ?? '',
      recoveryPublicKeys: recoveryKeys,
      recoveryRequired: Number(recoveryRequired.value),
      secondLockKind: secondLockKind.value as LockKind,
      secondLockValue: normalizedSecondLockValue(),
      emergencyPublicKeys: emergencyKeys,
      emergencyRequired: Number(emergencyRequired.value),
      hashKind: htlcHashKind.value as HashlockKind,
      hashDigest: htlcHashDigest.value,
      customMiniscript: customMiniscript?.value ?? '',
      customContext: customMiniscriptContext?.value === 'tapscript' ? 'tapscript' : 'p2wsh',
      ...(stagedDescriptorKeys === null ? {} : { stagedDescriptorKeys }),
    });
    const hex = policyHex(policy);
    policyAddress.textContent = policy.address;
    policyThresholdRow.hidden = policyMode.value === 'custom-miniscript';
    const thresholds = [`Primary: ${requiredSignatures.value} of ${keys.length}`];
    const modeHasRecovery = [
      'delayed-recovery',
      'delayed-recovery-multisig',
      'backup-committee',
      'decaying-multisig',
      'expanding-multisig',
      'escalating-recovery',
      'staged-recovery',
      'htlc',
    ].includes(policyMode.value);
    if (modeHasRecovery && recoveryKeys.length > 0) {
      const recoveryThreshold = ['delayed-recovery-multisig', 'backup-committee', 'decaying-multisig', 'expanding-multisig', 'escalating-recovery'].includes(policyMode.value)
        ? recoveryRequired.value
        : '1';
      thresholds.push(`Recovery: ${recoveryThreshold} of ${recoveryKeys.length}`);
    }
    if (emergencyKeys.length > 0) thresholds.push(`Emergency: ${emergencyRequired.value} of ${emergencyKeys.length}`);
    policyThreshold.textContent = thresholds.length === 1
      ? `${requiredSignatures.value} of ${keys.length}`
      : thresholds.join('\n');
    policyRequirement.textContent = policy.spendingRequirement;
    policyCompatibility.textContent = policy.compatibility;
    policyDescriptor.textContent = policy.descriptor;
    policyMiniscript.textContent = policy.miniscript;
    policyMiniscriptAsm.textContent = policy.miniscriptAsm;
    policyMiniscriptAnalysis.textContent = policy.miniscriptAnalysis;
    policyExpression.textContent = policy.policyExpression;
    redeemScript.textContent = hex.redeemScript;
    policyScriptPubKey.textContent = hex.scriptPubKey;
    dashImportRow.hidden = builderChain.value !== 'dash';
    dashImportArtifacts = builderChain.value === 'dash'
      ? buildDashCoreImport(policy.address, hex.redeemScript, policy.descriptor)
      : null;
    dashGuiRow.hidden = builderChain.value !== 'dash' || dashImportArtifacts?.fullPolicyGuiCommand === null;
    dashDescriptorRow.hidden = builderChain.value !== 'dash';
    dashImportWarning.hidden = builderChain.value !== 'dash';
    dashImportCommand.textContent = dashImportArtifacts?.legacyCommand ?? '';
    dashGuiCommand.textContent = dashImportArtifacts?.fullPolicyGuiCommand ?? '';
    dashDescriptorCommand.textContent = dashImportArtifacts?.addressFallbackGuiCommand ?? '';
    policyResults.hidden = false;
  } catch (error) {
    builderError.textContent = error instanceof Error ? error.message : String(error);
    builderError.hidden = false;
  }
}

function selectedWalletBranches(): MultisigBranch[] {
  const branches: MultisigBranch[] = [];
  if (walletReceiveBranch.checked) branches.push(0);
  if (walletChangeBranch.checked) branches.push(1);
  return branches;
}

function syncWalletControls(): void {
  walletWrapper.disabled = walletChain.value === 'dash';
  if (walletChain.value === 'dash') walletWrapper.value = 'p2sh';
}

function isCompressedPublicKey(value: string): boolean {
  return /^(02|03)[0-9a-f]{64}$/iu.test(value.trim());
}

function isAccountXpub(value: string): boolean {
  return /^(?:\[[0-9a-fA-F]{8}(?:\/[0-9]+['hH]?)+\])?[xt]pub[1-9A-HJ-NP-Za-km-z]+$/u.test(value.trim());
}

function buildWallet(): void {
  if (pendingWalletBuild !== null) {
    window.clearTimeout(pendingWalletBuild);
    pendingWalletBuild = null;
  }
  walletError.hidden = true;
  walletResults.hidden = true;
  try {
    const common = {
      chain: walletChain.value === 'dash' ? 'dash' as const : 'bitcoin' as const,
      network: selectedNetwork(walletNetwork, walletChain.value === 'dash' ? 'dash' : 'bitcoin'),
      required: Number(walletRequired.value),
      keyOrder: walletOrder.value === 'bip67' ? 'bip67' as const : 'supplied' as const,
      wrapper: walletWrapper.value === 'p2sh' ? 'p2sh' as const : 'p2wsh' as const,
    };
    const inputs = walletKeys.value.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
    const childKeyCount = inputs.filter(isCompressedPublicKey).length;
    const xpubCount = inputs.filter(isAccountXpub).length;
    if (inputs.length === 0) throw new Error('Enter compressed child public keys or account xpubs.');
    if (childKeyCount !== inputs.length && xpubCount !== inputs.length) {
      throw new Error('Use either all compressed child public keys or all account xpubs. Do not mix fixed child keys with ranged xpub derivation in one wallet.');
    }

    currentWallet = xpubCount === inputs.length
      ? buildRangedWallet({
          ...common,
          accountXpubs: inputs,
          branches: selectedWalletBranches(),
          startIndex: Number(walletStartIndex.value),
          endIndex: Number(walletEndIndex.value),
        })
      : buildConcreteMultisigWallet({
          ...common,
          publicKeys: inputs,
        });
    activeWalletBranch = 'rows' in currentWallet && currentWallet.rows.some((row) => row.branch === 0) ? 0 : 1;
    selectedWalletRows = new Set(walletRowRecords(currentWallet).map((row) => row.id));
    renderWallet();
    walletResults.hidden = false;
  } catch (error) {
    walletError.textContent = error instanceof Error ? error.message : String(error);
    walletError.hidden = false;
  }
}

function scheduleWalletBuild(): void {
  if (pendingWalletBuild !== null) window.clearTimeout(pendingWalletBuild);
  pendingWalletBuild = window.setTimeout(() => {
    pendingWalletBuild = null;
    if (walletKeys.value.trim().length > 0) buildWallet();
  }, 250);
}

interface WalletDisplayRow {
    readonly id: string;
    readonly branch: MultisigBranch;
    readonly index: number;
    readonly path: string;
    readonly address: string;
    readonly publicKeys: readonly string[];
    readonly scriptPubKey: string;
    readonly redeemScript: string;
  }

function walletRowRecords(wallet: WalletBuild): WalletDisplayRow[] {
    if ('rows' in wallet) {
      return wallet.rows.map((row) => ({
        id: `${row.branch}:${row.index}`,
        branch: row.branch,
        index: row.index,
        path: `${branchLabel(row.branch)} ${row.pathSuffix}`,
        address: row.address,
        publicKeys: row.publicKeys,
        scriptPubKey: row.scriptPubKey,
        redeemScript: row.redeemScript,
      }));
    }
    return [{
      id: 'concrete',
      branch: 0,
      index: 0,
      path: 'Concrete address; child public keys supplied directly',
      address: wallet.address,
      publicKeys: wallet.orderedPublicKeys,
      scriptPubKey: wallet.scriptPubKey,
      redeemScript: wallet.redeemScript,
    }];
}

function visibleWalletRows(): WalletDisplayRow[] {
    if (currentWallet === null) return [];
    const rows = walletRowRecords(currentWallet);
    return 'rows' in currentWallet ? rows.filter((row) => row.branch === activeWalletBranch) : rows;
}

function updateWalletBulkControls(): void {
    const total = currentWallet === null ? 0 : walletRowRecords(currentWallet).length;
    walletSelectedCount.textContent = `${selectedWalletRows.size.toLocaleString()} selected`;
    const disabled = currentWallet === null || selectedWalletRows.size === 0;
    for (const button of [walletCopyAddresses, walletCopyPublicKeys, walletCopySelected, walletCopyAllDisplayed, walletDownloadSelected, walletSelectAll, walletSelectNone, walletSelectInvert]) {
      button.disabled = currentWallet === null || (button !== walletSelectAll && disabled);
    }
    if (currentWallet !== null && selectedWalletRows.size === total) walletSelectedCount.textContent = `${total.toLocaleString()} selected`;
}

function walletFields(row: WalletDisplayRow): Array<readonly [string, string]> {
    const base: Array<readonly [string, string]> = [
      ['Path', row.path],
      ['Address', row.address],
    ];
    if (walletDetailMode === 'advanced') {
      base.push(
        ['Public keys', row.publicKeys.join('\n')],
        ['scriptPubKey', row.scriptPubKey],
        ['redeemScript', row.redeemScript],
      );
    }
    return base;
}

function walletExportRows(action: 'addresses' | 'publicKeys' | 'selected' | 'allDisplayed'): string {
    const rows = walletRowRecords(currentWallet!).filter((row) => selectedWalletRows.has(row.id));
    const format = walletExportFormat.value;
    const fields = (row: WalletDisplayRow): Array<readonly [string, string]> => {
      if (action === 'addresses') return [['Address', row.address]];
      if (action === 'publicKeys') return [['Public keys', row.publicKeys.join('\n')]];
      return walletFields(row);
    };
    if (format === 'plain') {
      return rows.flatMap((row) => fields(row).map(([, value]) => value)).join('\n');
    }
    if (format === 'tsv') {
      const sampleFields = rows[0] === undefined ? [] : fields(rows[0]);
      const headers = ['Path', ...sampleFields.map(([label]) => label).filter((label) => label !== 'Path')];
      return [
        headers.join('\t'),
        ...rows.map((row) => headers.map((header) => {
          const match = (header === 'Path' ? walletFields(row) : fields(row)).find(([label]) => label === header);
          return (match?.[1] ?? '').replace(/[\t\r\n]+/gu, ' ');
        }).join('\t')),
      ].join('\n');
    }
    return rows.map((row) => [`Index: ${row.index}`, ...fields(row).map(([label, value]) => `${label}: ${value}`)].join('\n')).join('\n\n');
}

function setWalletMode(mode: 'basic' | 'advanced'): void {
  walletDetailMode = mode;
  walletBasicMode.classList.toggle('active', mode === 'basic');
  walletAdvancedMode.classList.toggle('active', mode === 'advanced');
  walletBasicMode.setAttribute('aria-pressed', String(mode === 'basic'));
  walletAdvancedMode.setAttribute('aria-pressed', String(mode === 'advanced'));
  renderWallet();
}

function setWalletBranch(branch: MultisigBranch): void {
  activeWalletBranch = branch;
  renderWallet();
}

function renderWallet(): void {
  const wallet = currentWallet;
  if (wallet === null) return;
  updateWalletBulkControls();
  const descriptors = 'descriptors' in wallet ? wallet.descriptors : [{ label: 'concrete address', descriptor: wallet.descriptor }];
  walletDescriptors.replaceChildren(...descriptors.map((descriptor) => {
    const row = document.createElement('div');
    row.className = 'policy-row';
    row.append(textElement('span', '', descriptor.label), textElement('code', 'scroll-code', descriptor.descriptor));
    return row;
  }));
  walletImportText.textContent = wallet.importText;
  walletImportJson.textContent = wallet.importJson;
  walletDerivationDetails.textContent = wallet.derivationDetails;
  walletAdvancedOutput.hidden = walletDetailMode !== 'advanced';
  walletBranchTabs.hidden = !('rows' in wallet) || !wallet.rows.some((row) => row.branch === 1);
  walletReceiveTab.classList.toggle('active', activeWalletBranch === 0);
  walletChangeTab.classList.toggle('active', activeWalletBranch === 1);
  walletReceiveTab.setAttribute('aria-selected', String(activeWalletBranch === 0));
  walletChangeTab.setAttribute('aria-selected', String(activeWalletBranch === 1));

  const table = document.createElement('div');
  table.className = 'wallet-address-table';
  const rows = visibleWalletRows();
  if (walletDetailMode === 'basic') {
    const htmlTable = document.createElement('table');
    htmlTable.className = 'wallet-basic-table';
    const head = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (const label of ['Use', 'Path', 'Address']) headRow.append(textElement('th', '', label));
    head.append(headRow);
    const body = document.createElement('tbody');
    for (const row of rows) {
      const tr = document.createElement('tr');
      const use = document.createElement('td');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = selectedWalletRows.has(row.id);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selectedWalletRows.add(row.id);
        else selectedWalletRows.delete(row.id);
        updateWalletBulkControls();
      });
      use.append(checkbox);
      const path = textElement('td', 'value', row.path);
      const address = document.createElement('td');
      const addressLine = document.createElement('div');
      addressLine.className = 'wallet-inline-actions';
      addressLine.append(
        textElement('code', 'wallet-inline-value', row.address),
        copyButton(row.address),
        createPaymentQrAction(document, `${walletChain.value === 'dash' ? 'dash' : 'bitcoin'}:${row.address}`, 'multisig address'),
      );
      address.append(addressLine);
      tr.append(use, path, address);
      body.append(tr);
    }
    htmlTable.append(head, body);
    table.append(htmlTable);
  } else {
    for (const row of rows) {
      const card = document.createElement('div');
      card.className = 'wallet-advanced-card';
      for (const [label, value] of walletFields(row)) {
        const line = document.createElement('div');
        line.className = 'policy-row';
        line.append(textElement('span', '', label), textElement('code', 'scroll-code', value), copyButton(value));
        card.append(line);
      }
      table.append(card);
    }
  }
  walletAddressRows.replaceChildren(table);
}

function copyButton(value: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'secondary compact';
  button.type = 'button';
  button.textContent = 'Copy';
  button.addEventListener('click', async () => {
    await copyPlainText(value);
    const previous = button.textContent;
    button.textContent = 'Copied';
    setTimeout(() => { button.textContent = previous; }, 900);
  });
  return button;
}

modeButtons.forEach((button) => button.addEventListener('click', () => {
  const mode = button.dataset.mode;
  inspectorPanel.hidden = mode !== 'inspector';
  scriptPanel.hidden = mode !== 'script';
  builderPanel.hidden = mode !== 'builder';
  walletPanel.hidden = mode !== 'wallet';
  verifyPanel.hidden = mode !== 'verify';
  bip38Panel.hidden = mode !== 'bip38';
  modeButtons.forEach((item) => {
    const active = item === button;
    item.classList.toggle('active', active);
    item.setAttribute('aria-pressed', String(active));
  });
}));
inspectButton.addEventListener('click', inspect);
verifyMessageButton.addEventListener('click', () => { void verifyMessageSignature(); });
decryptBip38Button.addEventListener('click', () => { void decryptSelectedBip38Key(); });
clearBip38Button.addEventListener('click', clearBip38Decryptor);
toggleBip38Password.addEventListener('click', () => {
  const revealed = bip38Password.type === 'password';
  bip38Password.type = revealed ? 'text' : 'password';
  toggleBip38Password.textContent = revealed ? 'Hide' : 'Show';
  toggleBip38Password.setAttribute('aria-pressed', String(revealed));
});
toggleBip38Result.addEventListener('click', () => {
  setBip38ResultVisibility(!bip38ResultsRevealed);
});
decodeScriptButton.addEventListener('click', inspectScript);
calculatePreimageButton.addEventListener('click', calculatePreimage);
togglePreimageVisibilityButton.addEventListener('click', () => {
  const visible = preimagePhrase.type === 'password';
  preimagePhrase.type = visible ? 'text' : 'password';
  togglePreimageVisibilityButton.textContent = visible ? 'Hide' : 'Show';
  togglePreimageVisibilityButton.setAttribute('aria-pressed', String(visible));
});
clearPreimageButton.addEventListener('click', () => {
  preimagePhrase.value = '';
  preimagePhrase.type = 'password';
  togglePreimageVisibilityButton.textContent = 'Show';
  togglePreimageVisibilityButton.setAttribute('aria-pressed', 'false');
  for (const output of [preimageRaw, preimageNormalized, preimageNormalization, preimageSha256, preimageHash256, preimageRipemd160, preimageHash160]) output.textContent = '';
  preimageResults.hidden = true;
  preimageError.hidden = true;
  usePreimageBuilderButton.hidden = true;
});
usePreimageBuilderButton.addEventListener('click', () => {
  htlcHashKind.value = 'sha256';
  htlcHashDigest.value = preimageSha256.textContent ?? '';
  policyMode.value = 'htlc';
  if (lockKind.value === 'none') {
    lockKind.value = 'relative-blocks';
    lockValue.value = '144';
  }
  syncBuilderControls();
  modeButtons.find((button) => button.dataset.mode === 'builder')?.click();
});
clearButton.addEventListener('click', () => {
  psbtInput.value = '';
  results.hidden = true;
  errorBox.hidden = true;
});
clearScriptButton.addEventListener('click', () => {
  scriptInput.value = '';
  scriptResults.hidden = true;
  scriptError.hidden = true;
});
clearVerifierButton.addEventListener('click', () => {
  invalidateVerification();
  verifyAddress.value = '';
  verifyMessage.value = '';
  verifySignature.value = '';
  verifyResults.hidden = true;
  verifyError.hidden = true;
});
builderChain.addEventListener('change', syncBuilderControls);
builderWrapper.addEventListener('change', syncBuilderControls);
lockKind.addEventListener('change', syncBuilderControls);
secondLockKind.addEventListener('change', syncBuilderControls);
policyMode.addEventListener('change', syncBuilderControls);
for (const keyField of [publicKeys, recoveryPublicKey, emergencyPublicKeys]) keyField.addEventListener('input', syncBuilderControls);
buildButton.addEventListener('click', buildSelectedPolicy);
walletChain.addEventListener('change', syncWalletControls);
for (const [chainControl, networkControl] of [
  [chainSelect, networkSelect],
  [scriptChain, scriptNetwork],
  [verifyChain, verifyNetwork],
  [bip38Chain, bip38Network],
  [builderChain, builderNetwork],
  [walletChain, walletNetwork],
] as const) {
  chainControl.addEventListener('change', () => syncNetworkChoice(chainControl, networkControl));
  syncNetworkChoice(chainControl, networkControl);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    bip38Password.type = 'password';
    toggleBip38Password.textContent = 'Show';
    toggleBip38Password.setAttribute('aria-pressed', 'false');
    setBip38ResultVisibility(false);
  }
});
window.addEventListener('blur', () => {
  bip38Password.type = 'password';
  toggleBip38Password.textContent = 'Show';
  toggleBip38Password.setAttribute('aria-pressed', 'false');
  setBip38ResultVisibility(false);
});
buildWalletButton.addEventListener('click', buildWallet);
for (const control of [walletChain, walletNetwork, walletWrapper, walletOrder, walletRequired, walletKeys, walletStartIndex, walletEndIndex, walletReceiveBranch, walletChangeBranch]) {
  control.addEventListener('input', scheduleWalletBuild);
  control.addEventListener('change', scheduleWalletBuild);
}
walletBasicMode.addEventListener('click', () => setWalletMode('basic'));
walletAdvancedMode.addEventListener('click', () => setWalletMode('advanced'));
walletReceiveTab.addEventListener('click', () => setWalletBranch(0));
walletChangeTab.addEventListener('click', () => setWalletBranch(1));
walletSelectAll.addEventListener('click', () => {
  if (currentWallet !== null) selectedWalletRows = new Set(walletRowRecords(currentWallet).map((row) => row.id));
  renderWallet();
});
walletSelectNone.addEventListener('click', () => { selectedWalletRows.clear(); renderWallet(); });
walletSelectInvert.addEventListener('click', () => {
  if (currentWallet !== null) {
    const all = walletRowRecords(currentWallet);
    selectedWalletRows = new Set(all.filter((row) => !selectedWalletRows.has(row.id)).map((row) => row.id));
  }
  renderWallet();
});
walletCopyAddresses.addEventListener('click', () => { void copyPlainText(walletExportRows('addresses')); });
walletCopyPublicKeys.addEventListener('click', () => { void copyPlainText(walletExportRows('publicKeys')); });
walletCopySelected.addEventListener('click', () => { void copyPlainText(walletExportRows('selected')); });
walletCopyAllDisplayed.addEventListener('click', () => { void copyPlainText(walletExportRows('allDisplayed')); });
walletDownloadSelected.addEventListener('click', () => {
  const extension = walletExportFormat.value === 'tsv' ? 'tsv' : 'txt';
  downloadText(`multisig-wallet-selected.${extension}`, walletExportRows('selected'), walletExportFormat.value === 'tsv' ? 'text/tab-separated-values;charset=utf-8' : 'text/plain;charset=utf-8');
});
clearWalletButton.addEventListener('click', () => {
  if (pendingWalletBuild !== null) {
    window.clearTimeout(pendingWalletBuild);
    pendingWalletBuild = null;
  }
  walletKeys.value = '';
  currentWallet = null;
  walletResults.hidden = true;
  walletError.hidden = true;
});
downloadDashJson.addEventListener('click', () => {
  if (dashImportArtifacts !== null) downloadText('dash-core-import.json', dashImportArtifacts.rpcJson, 'application/json;charset=utf-8');
});
document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((button) => button.addEventListener('click', async () => {
  const source = required<HTMLElement>(button.dataset.copy ?? '');
  await navigator.clipboard.writeText(source.textContent ?? '');
  const old = button.textContent;
  button.textContent = 'Copied';
  setTimeout(() => { button.textContent = old; }, 900);
}));

required<HTMLElement>('psbt-build-version').textContent = BUILD_INFO.version;
required<HTMLElement>('psbt-build-date').textContent = BUILD_INFO.releaseDate;
required<HTMLElement>('psbt-build-fingerprint').textContent = BUILD_INFO.fingerprint;
required<HTMLElement>('psbt-artifact-checksum-file').textContent = BUILD_INFO.checksumFile;
required<HTMLElement>('psbt-build-footer').textContent = `Build ${BUILD_INFO.version}`;
syncBuilderControls();
syncWalletControls();
