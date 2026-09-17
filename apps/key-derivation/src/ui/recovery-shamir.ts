import { englishMnemonicToEntropy, entropyToEnglishMnemonic } from '@ckd/core/bip39.js';
import {
  createCkdShamirShares,
  recoverCkdShamirSharesDetailed,
  type CkdShamirShareFormat,
} from '@ckd/recovery-backup/shamir.js';
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

function selectedFormat(selector: string): CkdShamirShareFormat {
  const value = required<HTMLSelectElement>(selector).value;
  if (value !== 'raw' && value !== 'words') throw new Error('Select a CKD Shamir share encoding.');
  return value;
}

export function installShamir(context: RecoveryFeatureContext): void {
  installSecretToggle('#toggle-shamir-source', '#shamir-source', 'Reveal source phrase', 'Hide source phrase');
  installSecretToggle('#toggle-shamir-shares', '#shamir-shares', 'Reveal entered shares', 'Hide entered shares');
  installSecretToggle(
    '#toggle-shamir-created',
    '#shamir-create-result .share-secret',
    'Reveal created shares',
    'Hide created shares',
  );

  const createResult = required<HTMLElement>('#shamir-create-result');
  required<HTMLButtonElement>('#create-shamir').addEventListener('click', () => {
    createResult.replaceChildren();
    let entropy: Uint8Array | null = null;
    try {
      entropy = englishMnemonicToEntropy(context.readMnemonic('shamir', '#shamir-source'));
      const threshold = integer(required<HTMLInputElement>('#shamir-threshold'), 'Shares required', 2, 255);
      const count = integer(required<HTMLInputElement>('#shamir-count'), 'Shares created', threshold, 255);
      const created = createCkdShamirShares(entropy, threshold, count, selectedFormat('#shamir-create-format'));
      const heading = document.createElement('p');
      heading.textContent = `${threshold}-of-${count} shares created. Store the complete shares separately.`;
      createResult.append(heading);
      renderSensitiveShares(createResult, created.shares, context.writeClipboard);
    } catch (cause) {
      createResult.textContent = cause instanceof Error ? cause.message : 'Shamir share creation failed.';
    } finally {
      entropy?.fill(0);
    }
  });

  const restoreResult = required<HTMLElement>('#shamir-restore-result');
  required<HTMLButtonElement>('#restore-shamir').addEventListener('click', () => {
    restoreResult.replaceChildren();
    try {
      const recovered = recoverCkdShamirSharesDetailed(
        lines(required<HTMLTextAreaElement>('#shamir-shares').value),
        selectedFormat('#shamir-restore-format'),
      );
      try {
        renderRecoveredMnemonic(
          restoreResult,
          entropyToEnglishMnemonic(recovered.secret),
          context.writeClipboard,
          context.useMnemonicInDeriver,
        );
        if (recovered.integrity === 'legacy-checksum-only') {
          const warning = document.createElement('p');
          warning.className = 'warning-callout';
          warning.textContent =
            'Legacy CKD Shamir v1 shares were restored. They have per-card checksums but no v2 share-set digest, so checksum-valid substituted shares cannot be detected with the same assurance.';
          restoreResult.append(warning);
        }
      } finally {
        recovered.secret.fill(0);
      }
    } catch (cause) {
      restoreResult.textContent = cause instanceof Error ? cause.message : 'Shamir restoration failed.';
    }
  });

  installQrImageImport(document, required<HTMLTextAreaElement>('#shamir-shares'), {
    label: 'Read share QR image(s)',
    multiple: true,
    onDecoded: ({ text }) => text.trim(),
    onError(message) {
      restoreResult.textContent = message;
    },
  });
}
