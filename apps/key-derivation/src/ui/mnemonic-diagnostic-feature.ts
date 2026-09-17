import { diagnoseMnemonic, masterFingerprintFromSeed } from '@ckd/core/bip39.js';
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
  };
  const mayBeComplete = (): boolean => {
    const count = options.mnemonic.value.trim() === '' ? 0 : options.mnemonic.value.trim().split(/\s+/u).length;
    return count === 12 || count === 15 || count === 18 || count === 21 || count === 24;
  };
  const reset = (): void => update();
  return { update, mayBeComplete, reset };
}
