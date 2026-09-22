import { englishMnemonicToEntropy } from '@ckd/core/bip39.js';
import { createQrAction } from '@ckd/ui/payment-qr.js';
import { installQrImageImport } from '@ckd/ui/qr-image-import.js';
import {
  installSecretToggle,
  renderRecoveredMnemonic,
  required,
  type RecoveryFeatureContext,
} from './recovery-workspace-shared.js';

declare const __MHFE_WORKER_SOURCE__: string;

interface EncryptionResult {
  readonly encryptedMnemonic: string;
  readonly sourceWords: number;
  readonly pim: number;
  readonly effectivePasses: number;
}

interface DecryptionResult {
  readonly recoveredMnemonic: string;
  readonly sourceWords: number;
  readonly pim: number;
  readonly effectivePasses: number;
  readonly recoveryVerifier: 'matched' | 'unavailable';
}

interface ActiveOperation {
  readonly worker: Worker;
  readonly timer: number;
  stopped: boolean;
}

function selectedPim(prefix: 'encrypt' | 'decrypt'): number {
  const enabled = required<HTMLInputElement>(`#mhfe-${prefix}-use-pim`).checked;
  if (!enabled) return 0;
  const value = Number(required<HTMLInputElement>(`#mhfe-${prefix}-pim`).value);
  if (!Number.isSafeInteger(value) || value < 1 || value > 31) throw new Error('PIM must be an integer from 1 to 31.');
  return value;
}

function asciiPassword(prefix: 'encrypt' | 'decrypt'): string {
  const password = required<HTMLInputElement>(`#mhfe-${prefix}-password`).value;
  if (password.length === 0) throw new Error('Enter an MHFE password.');
  if (password.length > 1024) throw new Error('The password may contain at most 1024 ASCII bytes.');
  if (!/^[\x20-\x7e]+$/u.test(password)) {
    throw new Error(
      'This embedded MHFE v0.3.0 module accepts ASCII passwords. Unicode passwords require an exact Unicode 18 NPSS-NFKD implementation.',
    );
  }
  return password;
}

function installPimToggle(prefix: 'encrypt' | 'decrypt'): void {
  const checkbox = required<HTMLInputElement>(`#mhfe-${prefix}-use-pim`);
  const field = required<HTMLElement>(`#mhfe-${prefix}-pim-field`);
  const synchronize = (): void => {
    field.hidden = !checkbox.checked;
  };
  checkbox.addEventListener('change', synchronize);
  synchronize();
}

function formatElapsed(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function runWorker<T>(
  request: Record<string, unknown>,
  status: HTMLElement,
  stop: HTMLButtonElement,
  actions: readonly HTMLButtonElement[],
): Promise<T> {
  return new Promise((resolve, reject) => {
    const workerUrl = URL.createObjectURL(new Blob([__MHFE_WORKER_SOURCE__], { type: 'text/javascript' }));
    const worker = new Worker(workerUrl);
    URL.revokeObjectURL(workerUrl);
    const started = performance.now();
    for (const action of actions) action.disabled = true;
    stop.hidden = false;
    const operation: ActiveOperation = {
      worker,
      stopped: false,
      timer: window.setInterval(() => {
        status.textContent = `MHFE is running in an isolated worker · ${formatElapsed(performance.now() - started)} elapsed. The 512 MiB Argon2 work area can make this take a while.`;
      }, 1000),
    };
    status.textContent = 'Loading the verified MHFE v0.3.0 module…';
    const cleanup = (): void => {
      window.clearInterval(operation.timer);
      worker.terminate();
      stop.hidden = true;
      for (const action of actions) action.disabled = false;
    };
    stop.onclick = () => {
      operation.stopped = true;
      cleanup();
      status.textContent = 'MHFE operation stopped. Its worker and Argon2 memory were discarded.';
      reject(new Error('MHFE operation stopped.'));
    };
    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message || 'The MHFE worker stopped unexpectedly.'));
    };
    worker.onmessage = (event: MessageEvent<Record<string, unknown>>) => {
      if (event.data.type === 'initializationError') {
        cleanup();
        reject(new Error(String(event.data.error ?? 'MHFE initialization failed.')));
        return;
      }
      if (event.data.type === 'ready') {
        status.textContent = 'MHFE worker ready. Running 12 memory-hard Feistel rounds…';
        worker.postMessage({ id: 1, ...request });
        return;
      }
      if (event.data.id !== 1) return;
      cleanup();
      if (operation.stopped) return;
      if (event.data.ok === true) resolve(event.data.result as T);
      else reject(new Error(String(event.data.error ?? 'MHFE operation failed.')));
    };
  });
}

function renderEncryptedContainer(
  container: HTMLElement,
  result: EncryptionResult,
  copy: (value: string) => Promise<void>,
): void {
  const card = document.createElement('article');
  const title = document.createElement('strong');
  title.textContent = 'Encrypted 24-word MHFE container';
  const output = document.createElement('textarea');
  output.rows = 4;
  output.readOnly = true;
  output.className = 'concealed share-secret';
  output.value = result.encryptedMnemonic;
  const reveal = document.createElement('button');
  reveal.type = 'button';
  reveal.className = 'danger-outline compact';
  reveal.textContent = 'Reveal encrypted container';
  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'secret-action compact';
  copyButton.textContent = 'Copy encrypted container';
  copyButton.disabled = true;
  reveal.addEventListener('click', () => {
    const visible = output.classList.contains('concealed');
    output.classList.toggle('concealed', !visible);
    reveal.textContent = visible ? 'Hide encrypted container' : 'Reveal encrypted container';
    reveal.setAttribute('aria-pressed', String(visible));
    copyButton.disabled = !visible;
  });
  copyButton.addEventListener('click', () => void copy(result.encryptedMnemonic));
  const qr = createQrAction(document, result.encryptedMnemonic, 'MHFE encrypted container', result.encryptedMnemonic, {
    heading: 'Encrypted MHFE container QR',
    description: 'Checksum-valid 24-word BIP39 container:',
    ecc: 'M',
  });
  const actions = document.createElement('div');
  actions.className = 'share-secret-actions';
  actions.append(reveal, copyButton, qr);
  const metadata = document.createElement('p');
  metadata.className = 'field-note';
  metadata.textContent = `Source: ${result.sourceWords} words · PIM ${result.pim} · ${result.effectivePasses} Argon2id passes per round.`;
  card.append(title, output, actions, metadata);
  container.replaceChildren(card);
}

function verifierText(result: DecryptionResult): string {
  if (result.recoveryVerifier === 'unavailable') {
    return 'Recovery fingerprint: unavailable for a 24-word source. BIP39 checksum: valid because it was recomputed; this does not confirm the password or PIM.';
  }
  const verifierBits = 256 - ({ 12: 128, 15: 160, 18: 192, 21: 224 }[result.sourceWords] ?? 256);
  return `Recovery fingerprint: matched (${verifierBits} bits). Embedded BIP39 checksum prefix: matched. Recovered BIP39 phrase checksum: valid.`;
}

export function installMhfe(context: RecoveryFeatureContext): void {
  installSecretToggle('#toggle-mhfe-source', '#mhfe-source', 'Reveal source phrase', 'Hide source phrase');
  installSecretToggle(
    '#toggle-mhfe-container',
    '#mhfe-container',
    'Reveal encrypted container',
    'Hide encrypted container',
  );
  installPimToggle('encrypt');
  installPimToggle('decrypt');
  const encryptedInput = required<HTMLTextAreaElement>('#mhfe-container');
  installQrImageImport(document, encryptedInput, {
    label: 'Read encrypted-container QR image',
    onDecoded: (decoded) => decoded.text.trim(),
    onError: (message) => {
      required<HTMLElement>('#mhfe-decrypt-status').textContent = message;
    },
  });

  const encryptAction = required<HTMLButtonElement>('#mhfe-encrypt');
  const encryptStop = required<HTMLButtonElement>('#mhfe-encrypt-stop');
  const encryptStatus = required<HTMLElement>('#mhfe-encrypt-status');
  const encryptResult = required<HTMLElement>('#mhfe-encrypt-result');
  encryptAction.addEventListener('click', () => {
    encryptResult.replaceChildren();
    void (async () => {
      try {
        const password = asciiPassword('encrypt');
        if (password !== required<HTMLInputElement>('#mhfe-encrypt-password-confirm').value)
          throw new Error('Password confirmation does not match.');
        const pending = runWorker<EncryptionResult>(
          {
            type: 'encrypt',
            pim: selectedPim('encrypt'),
            passwordAscii: password,
            mnemonic: context.readMnemonic('mhfe', '#mhfe-source').trim(),
          },
          encryptStatus,
          encryptStop,
          [encryptAction, decryptAction],
        );
        required<HTMLInputElement>('#mhfe-encrypt-password').value = '';
        required<HTMLInputElement>('#mhfe-encrypt-password-confirm').value = '';
        const result = await pending;
        encryptStatus.textContent = 'Encryption complete. Record the password and any non-zero PIM separately.';
        renderEncryptedContainer(encryptResult, result, context.writeClipboard);
      } catch (cause) {
        if (encryptStatus.textContent?.startsWith('MHFE operation stopped')) return;
        encryptStatus.textContent = cause instanceof Error ? cause.message : 'MHFE encryption failed.';
      }
    })();
  });

  const decryptAction = required<HTMLButtonElement>('#mhfe-decrypt');
  const decryptStop = required<HTMLButtonElement>('#mhfe-decrypt-stop');
  const decryptStatus = required<HTMLElement>('#mhfe-decrypt-status');
  const decryptResult = required<HTMLElement>('#mhfe-decrypt-result');
  decryptAction.addEventListener('click', () => {
    decryptResult.replaceChildren();
    void (async () => {
      let entropy: Uint8Array | undefined;
      try {
        const pending = runWorker<DecryptionResult>(
          {
            type: required<HTMLInputElement>('#mhfe-source-was-24').checked ? 'decrypt24' : 'decryptAuto',
            pim: selectedPim('decrypt'),
            passwordAscii: asciiPassword('decrypt'),
            container: encryptedInput.value.trim(),
          },
          decryptStatus,
          decryptStop,
          [encryptAction, decryptAction],
        );
        required<HTMLInputElement>('#mhfe-decrypt-password').value = '';
        const result = await pending;
        entropy = englishMnemonicToEntropy(result.recoveredMnemonic);
        const verification = document.createElement('div');
        verification.className = result.recoveryVerifier === 'matched' ? 'success-callout' : 'warning-callout';
        verification.textContent = verifierText(result);
        decryptResult.append(verification);
        renderRecoveredMnemonic(
          decryptResult,
          result.recoveredMnemonic,
          context.writeClipboard,
          context.useMnemonicInDeriver,
        );
        decryptStatus.textContent = `Recovery complete · ${result.sourceWords} words · PIM ${result.pim} · ${result.effectivePasses} Argon2id passes per round.`;
      } catch (cause) {
        if (decryptStatus.textContent?.startsWith('MHFE operation stopped')) return;
        decryptStatus.textContent = cause instanceof Error ? cause.message : 'MHFE recovery failed.';
      } finally {
        entropy?.fill(0);
      }
    })();
  });
}
