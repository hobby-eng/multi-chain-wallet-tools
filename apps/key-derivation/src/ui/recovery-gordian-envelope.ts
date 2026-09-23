import { englishMnemonicToEntropy, entropyToEnglishMnemonic } from '@ckd/core/bip39.js';
import { describeUnknownError, freeThrownValue } from '@ckd/core/error-handling.js';
import {
  createProtectedGordianSeedEnvelope,
  deriveGordianRecipientKeys,
  recoverProtectedGordianSeedEnvelopeBundle,
} from '@ckd/recovery-backup/gordian-envelope.js';
import { installQrImageImport } from '@ckd/ui/qr-image-import.js';
import {
  installSecretToggle,
  installMnemonicSourceDiagnostic,
  lines,
  installThresholdGroupEditor,
  renderRecoveredMnemonicBundle,
  renderSensitiveShares,
  required,
  type RecoveryFeatureContext,
} from './recovery-workspace-shared.js';
function displayFailure(cause: unknown, fallback: string): string {
  const message = describeUnknownError(cause, fallback);
  freeThrownValue(cause);
  return message;
}

export function installGordianEnvelope(context: RecoveryFeatureContext): void {
  installSecretToggle(
    '#toggle-envelope-recipient-mnemonic',
    '#envelope-recipient-mnemonic',
    'Reveal recipient source phrase',
    'Hide recipient source phrase',
  );
  const recipientSource = required<HTMLSelectElement>('#envelope-recipient-source');
  const synchronizeRecipientSource = (): void => {
    const manual = recipientSource.value === 'manual';
    required<HTMLElement>('#envelope-current-recipient-source').hidden = manual;
    required<HTMLElement>('#envelope-manual-recipient-source').hidden = !manual;
  };
  recipientSource.addEventListener('change', synchronizeRecipientSource);
  synchronizeRecipientSource();
  const includePassphrase = required<HTMLInputElement>('#envelope-include-passphrase');
  const synchronizeIncludedPassphrase = (): void => {
    required<HTMLElement>('#envelope-included-passphrase-field').hidden = !includePassphrase.checked;
  };
  includePassphrase.addEventListener('change', synchronizeIncludedPassphrase);
  synchronizeIncludedPassphrase();

  const groupEditor = installThresholdGroupEditor('#envelope-sskr-groups', {
    initial: [],
    minimumRows: 0,
    addLabel: 'Add SSKR permit group',
    help: 'Each permit group creates a separate set of SSKR shares. First satisfy Shares required inside a group; then satisfy the Envelope group threshold with that many completed groups.',
  });
  installSecretToggle('#toggle-envelope-source', '#envelope-source', 'Reveal source phrase', 'Hide source phrase');
  installMnemonicSourceDiagnostic(
    context,
    'gordian-envelope',
    '#envelope-source',
    '#toggle-envelope-source',
    '#envelope-bip39-passphrase',
  );
  installSecretToggle(
    '#toggle-envelope-records',
    '#envelope-records, #envelope-private-key',
    'Reveal entered secrets',
    'Hide entered secrets',
  );
  installSecretToggle(
    '#toggle-envelope-created',
    '#envelope-create-result .share-secret',
    'Reveal created records',
    'Hide created records',
  );
  const result = required<HTMLElement>('#envelope-create-result');
  required<HTMLButtonElement>('#create-envelope').addEventListener('click', () => {
    result.replaceChildren();
    let entropy: Uint8Array | null = null;
    try {
      entropy = englishMnemonicToEntropy(context.readMnemonic('gordian-envelope', '#envelope-source'));
      const specs = groupEditor.read();
      const records = createProtectedGordianSeedEnvelope(
        entropy,
        required<HTMLInputElement>('#envelope-name').value,
        required<HTMLInputElement>('#envelope-note').value,
        {
          password: required<HTMLInputElement>('#envelope-password').value,
          bip39Passphrase: includePassphrase.checked
            ? (context.linkedValue('gordian-envelope')?.passphrase ??
              required<HTMLInputElement>('#envelope-included-passphrase').value)
            : undefined,
          recipientPublicKeys: lines(required<HTMLTextAreaElement>('#envelope-public-keys').value),
          sskrGroupThreshold: specs.length
            ? Number(required<HTMLInputElement>('#envelope-group-threshold').value)
            : undefined,
          sskrGroups: specs,
        },
      );
      renderSensitiveShares(
        result,
        records,
        context.writeClipboard,
        records.length === 1
          ? ['Seed Envelope record']
          : records.map((_, index) => `SSKR Envelope record ${index + 1}`),
      );
    } catch (e) {
      result.textContent = displayFailure(e, 'Envelope creation failed.');
    } finally {
      entropy?.fill(0);
    }
  });
  required<HTMLButtonElement>('#derive-envelope-recipient').addEventListener('click', () => {
    result.replaceChildren();
    let seed: Uint8Array | null = null;
    try {
      const linked = context.linkedValue('gordian-envelope');
      const manual = recipientSource.value === 'manual';
      const mnemonic = manual
        ? required<HTMLTextAreaElement>('#envelope-recipient-mnemonic').value
        : (linked?.mnemonic ?? required<HTMLTextAreaElement>('#envelope-source').value);
      const passphrase = manual
        ? required<HTMLInputElement>('#envelope-recipient-manual-passphrase').value
        : (linked?.passphrase ?? required<HTMLInputElement>('#envelope-bip39-passphrase').value);
      seed = context.mnemonicToSeed(mnemonic, passphrase);
      const keys = deriveGordianRecipientKeys(seed);
      const recipients = required<HTMLTextAreaElement>('#envelope-public-keys');
      const existing = lines(recipients.value);
      if (!existing.includes(keys.publicKey)) recipients.value = [...existing, keys.publicKey].join('\n');
      renderSensitiveShares(result, [keys.privateKey, keys.publicKey], context.writeClipboard, [
        'Recipient private key',
        'Recipient public key',
      ]);
    } catch (e) {
      result.textContent = displayFailure(e, 'Recipient derivation failed.');
    } finally {
      seed?.fill(0);
    }
  });
  const restored = required<HTMLElement>('#envelope-restore-result');
  required<HTMLButtonElement>('#restore-envelope').addEventListener('click', () => {
    restored.replaceChildren();
    let entropy: Uint8Array | null = null;
    try {
      const bundle = recoverProtectedGordianSeedEnvelopeBundle(
        lines(required<HTMLTextAreaElement>('#envelope-records').value),
        required<HTMLInputElement>('#envelope-unlock-password').value,
        required<HTMLTextAreaElement>('#envelope-private-key').value.trim(),
      );
      entropy = bundle.entropy;
      renderRecoveredMnemonicBundle(
        restored,
        entropyToEnglishMnemonic(entropy),
        bundle.bip39Passphrase,
        context.writeClipboard,
        context.useMnemonicInDeriver,
        context.mnemonicToSeed,
      );
    } catch (e) {
      restored.textContent = displayFailure(e, 'Envelope restoration failed.');
    } finally {
      entropy?.fill(0);
    }
  });
  installQrImageImport(document, required<HTMLTextAreaElement>('#envelope-records'), {
    label: 'Read Envelope QR image(s)',
    multiple: true,
    onDecoded: ({ text }) => text.trim(),
    onError: (m) => {
      restored.textContent = m;
    },
  });
}
