import { bytesToHex } from '@ckd/core/crypto.js';
import { diagnoseMnemonic, englishMnemonicToEntropy, masterFingerprintFromSeed } from '@ckd/core/bip39.js';
import type { KeyDerivationView } from './view.js';

interface MnemonicDiagnosticOptions {
  document: Document;
  view: KeyDerivationView;
  mnemonic: HTMLTextAreaElement;
  passphrase: HTMLInputElement;
  sourceRevealed(): boolean;
  mnemonicToSeed: typeof import('@ckd/core/bip39.js').mnemonicToSeed;
}

export function installMnemonicDiagnosticFeature(options: MnemonicDiagnosticOptions) {
  // Small controller fixtures and embedded hosts may expose only EventTarget. Entropy UI is optional there.
  const query =
    typeof options.document.querySelector === 'function'
      ? <T extends Element>(selector: string): T | null => options.document.querySelector<T>(selector)
      : <T extends Element>(_selector: string): T | null => null;
  const toggle = query<HTMLInputElement>('#show-mnemonic-entropy');
  const panel = query<HTMLElement>('#mnemonic-entropy');
  const output = query<HTMLTextAreaElement>('#mnemonic-entropy-value');
  const note = query<HTMLElement>('#mnemonic-entropy-note');

  const updateEntropy = (): void => {
    if (panel === null || output === null || note === null) return;
    const visible = toggle?.checked === true;
    panel.hidden = !visible;
    if (!visible) {
      panel.classList.remove('revealed');
      // Browser strings cannot be wiped in place; clearing the DOM value releases our retained reference.
      output.value = '';
      note.textContent = '';
      return;
    }
    let entropy: Uint8Array | null = null;
    try {
      entropy = englishMnemonicToEntropy(options.mnemonic.value);
      output.value = bytesToHex(entropy);
      panel.classList.toggle('revealed', options.sourceRevealed());
      output.classList.toggle('concealed', !options.sourceRevealed());
      note.textContent = `${entropy.length * 8}-bit entropy reconstructed from this BIP39 phrase and its checksum. The separate BIP39 passphrase is not included. Treat this value like the recovery phrase.`;
    } catch {
      panel.classList.remove('revealed');
      output.value = '';
      note.textContent = 'Enter a checksum-valid English BIP39 recovery phrase to show its entropy.';
    } finally {
      entropy?.fill(0);
    }
  };
  const update = (): void => {
    const diagnostic = diagnoseMnemonic(options.mnemonic.value);
    let seed: Uint8Array | null = null;
    let fingerprint: string | null = null;
    if (diagnostic.checksumValid) {
      try {
        seed = options.mnemonicToSeed(options.mnemonic.value, options.passphrase.value);
        fingerprint = masterFingerprintFromSeed(seed);
      } finally {
        seed?.fill(0);
      }
    }
    options.view.updateWordCount(options.sourceRevealed());
    options.view.updateSeedDiagnostic(diagnostic, fingerprint, options.sourceRevealed());
    updateEntropy();
  };
  const mayBeComplete = (): boolean => {
    const count = options.mnemonic.value.trim() === '' ? 0 : options.mnemonic.value.trim().split(/\s+/u).length;
    return count === 12 || count === 15 || count === 18 || count === 21 || count === 24;
  };
  const reset = (): void => {
    if (toggle !== null) toggle.checked = false;
    update();
  };
  toggle?.addEventListener('change', updateEntropy);
  return { update, updateEntropy, mayBeComplete, reset };
}
