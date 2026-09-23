import { englishMnemonicToEntropy, entropyToEnglishMnemonic } from '@ckd/core/bip39.js';
import { createCodex32Shares, recoverCodex32Shares } from '@ckd/recovery-backup/codex32.js';
import { installQrImageImport } from '@ckd/ui/qr-image-import.js';
import {
  installSecretToggle,
  installMnemonicSourceDiagnostic,
  integer,
  lines,
  renderRecoveredMnemonic,
  renderRecoveredSeed,
  renderSensitiveShares,
  required,
  type RecoveryFeatureContext,
} from './recovery-workspace-shared.js';
export function installCodex32(context: RecoveryFeatureContext): void {
  installSecretToggle('#toggle-codex32-source', '#codex32-source', 'Reveal source phrase', 'Hide source phrase');
  installMnemonicSourceDiagnostic(
    context,
    'codex32',
    '#codex32-source',
    '#toggle-codex32-source',
    '#codex32-passphrase',
  );
  installSecretToggle('#toggle-codex32-shares', '#codex32-shares', 'Reveal entered records', 'Hide entered records');
  installSecretToggle(
    '#toggle-codex32-created',
    '#codex32-create-result .share-secret',
    'Reveal created records',
    'Hide created records',
  );
  installQrImageImport(document, required<HTMLTextAreaElement>('#codex32-shares'), {
    label: 'Read share QR image(s)',
    multiple: true,
    onDecoded: ({ text }) => text.trim(),
    onError(message) {
      required<HTMLElement>('#codex32-restore-result').textContent = message;
    },
  });
  const codex32SecretType = required<HTMLSelectElement>('#codex32-secret-type');
  const codex32RestoreType = required<HTMLSelectElement>('#codex32-restore-type');
  const codex32Passphrase = required<HTMLInputElement>('#codex32-passphrase');
  const codex32SecretTypeNote = required<HTMLElement>('#codex32-secret-type-note');
  const codex32ContentWarning = required<HTMLElement>('#codex32-content-warning');
  const synchronizeCodex32SecretType = (): void => {
    const storesEntropy = codex32SecretType.value === 'bip39-entropy';
    codex32Passphrase.disabled = storesEntropy;
    codex32SecretTypeNote.textContent = storesEntropy
      ? 'Stores the phrase entropy and checksum length. The separate BIP39 passphrase is not included.'
      : 'Applies the exact Unicode BIP39 passphrase and stores the resulting 64-byte wallet seed.';
    codex32ContentWarning.replaceChildren();
    const title = document.createElement('strong');
    title.textContent = storesEntropy ? 'Recovery-phrase backup.' : 'One-way source conversion.';
    codex32ContentWarning.append(
      title,
      document.createTextNode(
        storesEntropy
          ? ' Restoring these records reconstructs the original English BIP39 words. Keep any BIP39 passphrase separately.'
          : ' The same BIP32 wallet seed is restored, but PBKDF2 prevents reconstructing the original words or passphrase.',
      ),
    );
  };
  codex32SecretType.addEventListener('change', synchronizeCodex32SecretType);
  synchronizeCodex32SecretType();

  const codex32Identifier = required<HTMLInputElement>('#codex32-identifier');
  const codex32IdentifierPattern = /^[023456789acdefghjklmnpqrstuvwxyz]{4}$/u;
  const synchronizeIdentifier = (): void => {
    const lowercase = codex32Identifier.value.toLowerCase();
    if (lowercase !== codex32Identifier.value) codex32Identifier.value = lowercase;
    const valid = codex32IdentifierPattern.test(lowercase);
    codex32Identifier.setCustomValidity(
      valid ? '' : 'Use exactly four Bech32 characters. The characters b, i, o, and 1 are not available.',
    );
    codex32Identifier.setAttribute('aria-invalid', String(!valid));
  };
  codex32Identifier.addEventListener('input', synchronizeIdentifier);
  synchronizeIdentifier();

  const codex32Threshold = required<HTMLInputElement>('#codex32-threshold');
  const codex32Count = required<HTMLInputElement>('#codex32-count');
  const codex32Unsplit = required<HTMLInputElement>('#codex32-unsplit');
  codex32Unsplit.addEventListener('change', () => {
    codex32Threshold.disabled = codex32Unsplit.checked;
    codex32Count.disabled = codex32Unsplit.checked;
  });
  const codex32CreateResult = required<HTMLElement>('#codex32-create-result');
  required<HTMLButtonElement>('#create-codex32').addEventListener('click', () => {
    codex32CreateResult.replaceChildren();
    let secretData: Uint8Array | undefined;
    try {
      const linked = context.linkedValue('codex32');
      const mnemonic = linked?.mnemonic ?? required<HTMLTextAreaElement>('#codex32-source').value.trim();
      const entropy = englishMnemonicToEntropy(mnemonic);
      if (codex32SecretType.value === 'bip39-entropy') {
        secretData = entropy;
      } else {
        entropy.fill(0);
        secretData = context.mnemonicToSeed(mnemonic, linked?.passphrase ?? codex32Passphrase.value);
      }
      synchronizeIdentifier();
      if (!codex32Identifier.checkValidity()) {
        codex32Identifier.reportValidity();
        codex32Identifier.focus();
        codex32CreateResult.textContent = codex32Identifier.validationMessage;
        return;
      }
      const threshold = codex32Unsplit.checked ? 0 : integer(codex32Threshold, 'Codex32 threshold', 2, 9);
      const count = codex32Unsplit.checked ? 1 : integer(codex32Count, 'Codex32 share count', threshold, 31);
      const created = createCodex32Shares(secretData, codex32Identifier.value, threshold, count);
      const heading = document.createElement('p');
      const contentLabel = codex32SecretType.value === 'bip39-entropy' ? 'BIP39-entropy' : 'BIP32-master-seed';
      heading.textContent =
        threshold === 0
          ? 'One unsplit Codex32 ' + contentLabel + ' record created.'
          : String(threshold) +
            '-of-' +
            String(count) +
            ' Codex32 ' +
            contentLabel +
            ' shares created. Store the complete shares separately.';
      codex32CreateResult.append(heading);
      renderSensitiveShares(codex32CreateResult, created.shares, context.writeClipboard);
    } catch (cause) {
      codex32CreateResult.textContent = cause instanceof Error ? cause.message : 'Codex32 backup creation failed.';
    } finally {
      secretData?.fill(0);
    }
  });

  const codex32RestoreResult = required<HTMLElement>('#codex32-restore-result');
  required<HTMLButtonElement>('#restore-codex32').addEventListener('click', () => {
    codex32RestoreResult.replaceChildren();
    let seed: Uint8Array | undefined;
    try {
      seed = recoverCodex32Shares(lines(required<HTMLTextAreaElement>('#codex32-shares').value));
      if (codex32RestoreType.value === 'bip39-entropy') {
        if (![16, 20, 24, 28, 32].includes(seed.length)) {
          throw new Error('BIP39 entropy must contain exactly 16, 20, 24, 28, or 32 bytes.');
        }
        renderRecoveredMnemonic(
          codex32RestoreResult,
          entropyToEnglishMnemonic(seed),
          context.writeClipboard,
          context.useMnemonicInDeriver,
          context.mnemonicToSeed,
        );
      } else {
        renderRecoveredSeed(codex32RestoreResult, seed, context.writeClipboard);
      }
    } catch (cause) {
      codex32RestoreResult.textContent = cause instanceof Error ? cause.message : 'Codex32 restoration failed.';
    } finally {
      seed?.fill(0);
    }
  });
}
