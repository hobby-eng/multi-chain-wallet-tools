import { englishMnemonicToEntropy, entropyToEnglishMnemonic } from '@ckd/core/bip39.js';
import { createShamirShares, recoverShamirShares, type ShamirShareFormat } from '@ckd/recovery-backup/shamir.js';
import { installQrImageImport } from '@ckd/ui/qr-image-import.js';
import type { RecoverySourceTarget } from './recovery-source-link.js';
import {
  installSecretToggle,
  integer,
  lines,
  renderRecoveredMnemonic,
  renderSensitiveShares,
  required,
  type RecoveryFeatureContext,
} from './recovery-workspace-shared.js';
function installShamirMethod(
  prefix: 'shamir-raw' | 'shamir-words',
  format: ShamirShareFormat,
  copy: (value: string) => Promise<void>,
  readMnemonic: (target: RecoverySourceTarget, selector: string) => string,
  useMnemonicInDeriver: (mnemonic: string) => void,
): void {
  installSecretToggle(`#toggle-${prefix}-source`, `#${prefix}-source`, 'Reveal source phrase', 'Hide source phrase');
  installSecretToggle(`#toggle-${prefix}-shares`, `#${prefix}-shares`, 'Reveal entered shares', 'Hide entered shares');
  installSecretToggle(
    `#toggle-${prefix}-created`,
    `#${prefix}-create-result .share-secret`,
    'Reveal created shares',
    'Hide created shares',
  );
  const createResult = required<HTMLElement>(`#${prefix}-create-result`);
  required<HTMLButtonElement>(`#create-${prefix}`).addEventListener('click', () => {
    createResult.replaceChildren();
    try {
      const entropy = englishMnemonicToEntropy(readMnemonic(prefix, `#${prefix}-source`));
      try {
        const threshold = integer(required<HTMLInputElement>(`#${prefix}-threshold`), 'Share threshold', 2, 255);
        const count = integer(required<HTMLInputElement>(`#${prefix}-count`), 'Share count', threshold, 255);
        const created = createShamirShares(entropy, threshold, count, format);
        const heading = document.createElement('p');
        heading.textContent = `${threshold}-of-${count} shares created. Store the complete shares separately.`;
        createResult.append(heading);
        renderSensitiveShares(createResult, created.shares, copy);
      } finally {
        entropy.fill(0);
      }
    } catch (cause) {
      createResult.textContent = cause instanceof Error ? cause.message : 'Shamir share creation failed.';
    }
  });
  const restoreResult = required<HTMLElement>(`#${prefix}-restore-result`);
  required<HTMLButtonElement>(`#restore-${prefix}`).addEventListener('click', () => {
    restoreResult.replaceChildren();
    try {
      const secret = recoverShamirShares(lines(required<HTMLTextAreaElement>(`#${prefix}-shares`).value), format);
      try {
        renderRecoveredMnemonic(restoreResult, entropyToEnglishMnemonic(secret), copy, useMnemonicInDeriver);
      } finally {
        secret.fill(0);
      }
    } catch (cause) {
      restoreResult.textContent = cause instanceof Error ? cause.message : 'Shamir restoration failed.';
    }
  });
}
export function installShamir(context: RecoveryFeatureContext): void {
  installShamirMethod('shamir-raw', 'raw', context.writeClipboard, context.readMnemonic, context.useMnemonicInDeriver);
  installShamirMethod(
    'shamir-words',
    'words',
    context.writeClipboard,
    context.readMnemonic,
    context.useMnemonicInDeriver,
  );
  for (const [selector, result] of [
    ['#shamir-raw-shares', '#shamir-raw-restore-result'],
    ['#shamir-words-shares', '#shamir-words-restore-result'],
  ] as const) {
    installQrImageImport(document, required<HTMLTextAreaElement>(selector), {
      label: 'Read share QR image(s)',
      multiple: true,
      onDecoded: ({ text }) => text.trim(),
      onError(message) {
        required<HTMLElement>(result).textContent = message;
      },
    });
  }
}
