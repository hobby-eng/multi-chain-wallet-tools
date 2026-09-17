import { englishMnemonicToEntropy } from '@ckd/core/bip39.js';
import type { RecoverySourceReference, RecoverySourceTarget } from './recovery-source-link.js';

interface RecoverySourceControllerOptions {
  document: Document;
  open: (reference: RecoverySourceReference, target: RecoverySourceTarget) => void;
  originalReference: () => RecoverySourceReference;
  childReference: () => RecoverySourceReference | null;
  showError: (message: string) => void;
}

const RECOVERY_SOURCE_TARGETS = new Set<RecoverySourceTarget>([
  'matcher',
  'seedqr',
  'slip39',
  'shamir',
  'codex32',
  'sskr',
  'gordian-envelope',
]);

/** Routes an in-memory mnemonic reference without copying it through the OS clipboard. */
export function installRecoverySourceController(options: RecoverySourceControllerOptions): void {
  options.document.addEventListener('click', (event) => {
    const button =
      event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-recovery-source]') : null;
    if (button === null) return;
    const target = button.dataset.recoveryTarget as RecoverySourceTarget | undefined;
    if (target === undefined || !RECOVERY_SOURCE_TARGETS.has(target)) return;
    let reference: RecoverySourceReference;
    if (button.dataset.recoverySource === 'bip85') {
      const childReference = options.childReference();
      if (childReference === null) {
        options.showError('Derive a BIP39 child phrase before sending it to Recover & Back Up.');
        return;
      }
      reference = childReference;
    } else {
      reference = options.originalReference();
      const source = reference.read();
      let entropy: Uint8Array | null = null;
      try {
        if (source === null) throw new Error('The original recovery source is no longer available.');
        entropy = englishMnemonicToEntropy(source.mnemonic);
      } catch {
        options.showError('Enter a checksum-valid English BIP39 recovery phrase first.');
        return;
      } finally {
        entropy?.fill(0);
      }
    }
    options.open(reference, target);
    button.closest('details')?.removeAttribute('open');
  });
}
