import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import {
  decodeCompactSeedQr,
  decodeStandardSeedQr,
  encodeCompactSeedQr,
  encodeStandardSeedQr,
} from '@ckd/recovery-backup/seedqr.js';
import { createQrAction } from '@ckd/ui/payment-qr.js';
import { installQrImageImport } from '@ckd/ui/qr-image-import.js';
import {
  installSecretToggle,
  renderRecoveredMnemonic,
  required,
  type RecoveryFeatureContext,
} from './recovery-workspace-shared.js';
export function installSeedQr(context: RecoveryFeatureContext): void {
  installSecretToggle('#toggle-seedqr-source', '#seedqr-source', 'Reveal source phrase', 'Hide source phrase');
  installSecretToggle(
    '#toggle-seedqr-created',
    '#seedqr-create-result .share-secret',
    'Reveal encoded payload',
    'Hide encoded payload',
  );
  installSecretToggle('#toggle-seedqr-payload', '#seedqr-payload', 'Reveal decoded payload', 'Hide decoded payload');
  installQrImageImport(document, required<HTMLTextAreaElement>('#seedqr-payload'), {
    onDecoded(decoded) {
      const compact = decoded.binaryData;
      if (compact !== undefined && [16, 20, 24, 28, 32].includes(compact.length)) {
        required<HTMLSelectElement>('#seedqr-restore-format').value = 'compact';
        return bytesToHex(compact);
      }
      required<HTMLSelectElement>('#seedqr-restore-format').value = 'standard';
      return decoded.text.trim();
    },
    onError(message) {
      required<HTMLElement>('#seedqr-restore-result').textContent = message;
    },
  });
  const seedQrCreateResult = required<HTMLElement>('#seedqr-create-result');
  required<HTMLButtonElement>('#create-seedqr').addEventListener('click', () => {
    seedQrCreateResult.replaceChildren();
    let compact: Uint8Array | undefined;
    try {
      const mnemonic = context.readMnemonic('seedqr', '#seedqr-source');
      const format = required<HTMLSelectElement>('#seedqr-format').value;
      const payload = format === 'compact' ? (compact = encodeCompactSeedQr(mnemonic)) : encodeStandardSeedQr(mnemonic);
      const displayed = typeof payload === 'string' ? payload : bytesToHex(payload);
      const card = document.createElement('article');
      const title = document.createElement('strong');
      title.textContent = format === 'compact' ? 'CompactSeedQR' : 'Standard SeedQR';
      const text = document.createElement('p');
      text.className = 'concealed share-secret';
      text.textContent = displayed;
      const qr = createQrAction(
        document,
        typeof payload === 'string' ? payload : Array.from(payload),
        title.textContent,
        displayed,
        {
          heading: title.textContent,
          description: format === 'compact' ? 'Binary payload shown below as hexadecimal:' : 'Numeric payload:',
          ecc: 'L',
        },
      );
      qr.classList.add('share-qr-action');
      card.append(title, text, qr);
      seedQrCreateResult.append(card);
    } catch (cause) {
      seedQrCreateResult.textContent = cause instanceof Error ? cause.message : 'SeedQR creation failed.';
    } finally {
      compact?.fill(0);
    }
  });

  const seedQrRestoreResult = required<HTMLElement>('#seedqr-restore-result');
  required<HTMLButtonElement>('#restore-seedqr').addEventListener('click', () => {
    seedQrRestoreResult.replaceChildren();
    let compact: Uint8Array | undefined;
    try {
      const format = required<HTMLSelectElement>('#seedqr-restore-format').value;
      const payload = required<HTMLTextAreaElement>('#seedqr-payload').value.trim();
      const mnemonic =
        format === 'compact' ? decodeCompactSeedQr((compact = hexToBytes(payload))) : decodeStandardSeedQr(payload);
      renderRecoveredMnemonic(
        seedQrRestoreResult,
        mnemonic,
        context.writeClipboard,
        context.useMnemonicInDeriver,
        context.mnemonicToSeed,
      );
    } catch (cause) {
      seedQrRestoreResult.textContent = cause instanceof Error ? cause.message : 'SeedQR restoration failed.';
    } finally {
      compact?.fill(0);
    }
  });
}
