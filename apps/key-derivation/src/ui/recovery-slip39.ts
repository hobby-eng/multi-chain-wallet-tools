import { englishMnemonicToEntropy, entropyToEnglishMnemonic } from '@ckd/core/bip39.js';
import { recoverSlip39Shares, createSlip39Shares, parseSlip39Share } from '@ckd/recovery-backup/slip39.js';
import { installQrImageImport } from '@ckd/ui/qr-image-import.js';
import {
  installSecretToggle,
  integer,
  lines,
  renderRecoveredMnemonic,
  renderSensitiveShares,
  required,
  type RecoveryFeatureContext,
} from './recovery-workspace-shared.js';
export function installSlip39(context: RecoveryFeatureContext): void {
  installSecretToggle('#toggle-slip39-source', '#slip39-source-mnemonic', 'Reveal source phrase', 'Hide source phrase');
  installSecretToggle('#toggle-slip39-shares', '#slip39-shares', 'Reveal entered shares', 'Hide entered shares');
  installSecretToggle(
    '#toggle-slip39-created',
    '#slip39-create-result .share-secret',
    'Reveal created shares',
    'Hide created shares',
  );
  installQrImageImport(document, required<HTMLTextAreaElement>('#slip39-shares'), {
    label: 'Read share QR image(s)',
    multiple: true,
    onDecoded: ({ text }) => text.trim(),
    onError(message) {
      required<HTMLElement>('#slip39-restore-result').textContent = message;
    },
  });
  const createResult = required<HTMLElement>('#slip39-create-result');
  required<HTMLButtonElement>('#create-slip39-shares').addEventListener('click', () => {
    createResult.replaceChildren();
    try {
      const mnemonic = context.readMnemonic('slip39', '#slip39-source-mnemonic').trim();
      const entropy = englishMnemonicToEntropy(mnemonic);
      try {
        const threshold = integer(required<HTMLInputElement>('#slip39-threshold'), 'Share threshold', 1, 16);
        const count = integer(required<HTMLInputElement>('#slip39-count'), 'Share count', threshold, 16);
        const shares = createSlip39Shares(entropy, {
          groupThreshold: 1,
          groups: [{ memberThreshold: threshold, memberCount: count }],
          passphrase: required<HTMLInputElement>('#slip39-create-passphrase').value,
          extendable: required<HTMLSelectElement>('#slip39-format').value === 'extendable',
          iterationExponent: 1,
        })[0]!;
        const heading = document.createElement('p');
        heading.textContent = `${threshold}-of-${count} SLIP-39 shares created. Store the shares separately.`;
        createResult.append(heading);
        renderSensitiveShares(createResult, shares, context.writeClipboard);
      } finally {
        entropy.fill(0);
      }
    } catch (cause) {
      createResult.textContent = cause instanceof Error ? cause.message : 'SLIP-39 share creation failed.';
    }
  });

  const restoreResult = required<HTMLElement>('#slip39-restore-result');
  let restoredMnemonic = '';
  required<HTMLButtonElement>('#restore-slip39-shares').addEventListener('click', () => {
    restoredMnemonic = '';
    restoreResult.replaceChildren();
    try {
      const shares = lines(required<HTMLTextAreaElement>('#slip39-shares').value);
      for (const share of shares) parseSlip39Share(share);
      const secret = recoverSlip39Shares(shares, required<HTMLInputElement>('#slip39-restore-passphrase').value);
      try {
        restoredMnemonic = entropyToEnglishMnemonic(secret);
      } finally {
        secret.fill(0);
      }
      renderRecoveredMnemonic(restoreResult, restoredMnemonic, context.writeClipboard, context.useMnemonicInDeriver);
    } catch (cause) {
      restoreResult.textContent = cause instanceof Error ? cause.message : 'SLIP-39 restoration failed.';
    }
  });
}
