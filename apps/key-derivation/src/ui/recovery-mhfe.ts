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
  readonly profileId?: string;
  readonly iterations?: number;
  readonly preservedFinalWord?: string;
}

interface DecryptionResult {
  readonly recoveredMnemonic: string;
  readonly sourceWords: number;
  readonly pim: number;
  readonly effectivePasses: number;
  readonly recoveryVerifier?: 'matched' | 'unavailable';
  readonly profileId?: string;
  readonly iterations?: number;
  readonly preservedFinalWord?: string;
}

interface AmbiguousDecryptionResult {
  readonly ambiguousCandidates: readonly DecryptionResult[];
}

interface CycleWalkProgress {
  readonly iterations: number;
  readonly matched: boolean;
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
      'This embedded MHFE v0.3.1 module accepts ASCII passwords. Unicode passwords require an exact Unicode 18 NPSS-NFKD implementation.',
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

function installPasswordToggle(buttonSelector: string, inputSelector: string, label: string): void {
  const button = required<HTMLButtonElement>(buttonSelector);
  const input = required<HTMLInputElement>(inputSelector);
  const synchronize = (): void => {
    const revealed = input.type === 'text';
    button.textContent = revealed ? 'Hide' : 'Show';
    button.setAttribute('aria-pressed', String(revealed));
    button.setAttribute('aria-label', `${revealed ? 'Hide' : 'Show'} ${label}`);
  };
  button.addEventListener('click', () => {
    input.type = input.type === 'password' ? 'text' : 'password';
    synchronize();
  });
  synchronize();
}

function selectedSourceWords(): number | undefined {
  const selected = required<HTMLSelectElement>('#mhfe-decrypt-source-words').value;
  if (selected === 'auto') return undefined;
  const sourceWords = Number(selected);
  if (![12, 15, 18, 21, 24].includes(sourceWords)) throw new Error('Select a valid original phrase length.');
  return sourceWords;
}

function isAmbiguousDecryption(result: DecryptionResult | AmbiguousDecryptionResult): result is AmbiguousDecryptionResult {
  return 'ambiguousCandidates' in result;
}

function formatElapsed(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function formatDuration(milliseconds: number): string {
  const minutes = Math.max(1, Math.round(milliseconds / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours} h` : `${hours} h ${remainder} min`;
}

function runWorker<T>(
  request: Record<string, unknown>,
  status: HTMLElement,
  stop: HTMLButtonElement,
  actions: readonly HTMLButtonElement[],
  onProgress?: (progress: CycleWalkProgress, elapsedMilliseconds: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const workerUrl = URL.createObjectURL(new Blob([__MHFE_WORKER_SOURCE__], { type: 'text/javascript' }));
    const worker = new Worker(workerUrl);
    URL.revokeObjectURL(workerUrl);
    const started = performance.now();
    let receivedProgress = false;
    for (const action of actions) action.disabled = true;
    stop.hidden = false;
    const operation: ActiveOperation = {
      worker,
      stopped: false,
      timer: window.setInterval(() => {
        if (receivedProgress) return;
        status.textContent = `MHFE is running in an isolated worker · ${formatElapsed(performance.now() - started)} elapsed. The 512 MiB Argon2 work area can make this take a while.`;
      }, 1000),
    };
    status.textContent = 'Loading the verified MHFE v0.3.1 module…';
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
      if (event.data.type === 'progress') {
        receivedProgress = true;
        onProgress?.(event.data.progress as unknown as CycleWalkProgress, performance.now() - started);
        return;
      }
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
  metadata.textContent = `Source: ${result.sourceWords} words · PIM ${result.pim} · ${result.effectivePasses} Argon2id passes per round.${
    result.iterations === undefined
      ? ''
      : ` Final word preserved after ${result.iterations.toLocaleString('en-US')} complete permutations; “${result.preservedFinalWord}” is visible in both phrases.`
  }`;
  card.append(title, output, actions, metadata);
  container.replaceChildren(card);
}

function recoverySummary(result: DecryptionResult): string {
  if (result.profileId !== undefined) {
    return `Phrase recovered · 24 words · final word “${result.preservedFinalWord}” preserved · BIP39 checksum valid. The visible word does not confirm the password or PIM.`;
  }
  if (result.recoveryVerifier === 'unavailable') {
    return 'Phrase recovered · 24 words · BIP39 checksum valid · no internal recovery fingerprint.';
  }
  const verifierBits = 256 - ({ 12: 128, 15: 160, 18: 192, 21: 224 }[result.sourceWords] ?? 256);
  return `Phrase recovered · recovery fingerprint matched (${verifierBits} bits) · BIP39 checksum valid · ${result.sourceWords} words.`;
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
  installPasswordToggle('#toggle-mhfe-encrypt-password', '#mhfe-encrypt-password', 'MHFE password');
  installPasswordToggle(
    '#toggle-mhfe-encrypt-password-confirm',
    '#mhfe-encrypt-password-confirm',
    'password confirmation',
  );
  installPasswordToggle('#toggle-mhfe-decrypt-password', '#mhfe-decrypt-password', 'MHFE password');
  const preserveOnRecovery = required<HTMLInputElement>('#mhfe-decrypt-preserve-final-word');
  const sourceWordsOverride = required<HTMLSelectElement>('#mhfe-decrypt-source-words');
  let selectionBeforeFinalWordMode = sourceWordsOverride.value;
  const synchronizeFinalWordMode = (): void => {
    if (preserveOnRecovery.checked) {
      selectionBeforeFinalWordMode = sourceWordsOverride.value;
      sourceWordsOverride.value = '24';
      sourceWordsOverride.disabled = true;
      return;
    }
    sourceWordsOverride.disabled = false;
    sourceWordsOverride.value = selectionBeforeFinalWordMode;
  };
  preserveOnRecovery.addEventListener('change', synchronizeFinalWordMode);
  synchronizeFinalWordMode();
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
    encryptStatus.classList.remove('warning');
    void (async () => {
      try {
        const password = asciiPassword('encrypt');
        if (password !== required<HTMLInputElement>('#mhfe-encrypt-password-confirm').value)
          throw new Error('Password confirmation does not match.');
        const preserveFinalWord = required<HTMLInputElement>('#mhfe-encrypt-preserve-final-word').checked;
        const pending = runWorker<EncryptionResult>(
          {
            type: preserveFinalWord ? 'encryptPreservingFinalWord' : 'encrypt',
            pim: selectedPim('encrypt'),
            passwordAscii: password,
            mnemonic: context.readMnemonic('mhfe', '#mhfe-source').trim(),
          },
          encryptStatus,
          encryptStop,
          [encryptAction, decryptAction],
          preserveFinalWord
            ? (progress, elapsed) => {
                const average = elapsed / progress.iterations;
                encryptStatus.textContent = progress.matched
                  ? `Final word matched after ${progress.iterations.toLocaleString('en-US')} complete permutations.`
                  : `Final-word search · ${progress.iterations.toLocaleString('en-US')} complete permutations · ${formatElapsed(elapsed)} elapsed · this-device estimate: median ${formatDuration(average * 1420)}, mean ${formatDuration(average * 2048)} remaining. Stop is safe; a stopped search must be restarted.`;
              }
            : undefined,
        );
        required<HTMLInputElement>('#mhfe-encrypt-password').value = '';
        required<HTMLInputElement>('#mhfe-encrypt-password-confirm').value = '';
        const result = await pending;
        encryptStatus.textContent = preserveFinalWord
          ? `Encryption complete after ${result.iterations?.toLocaleString('en-US')} permutations. The final word “${result.preservedFinalWord}” is intentionally visible.`
          : 'Encryption complete. Record the password and any non-zero PIM separately.';
        renderEncryptedContainer(encryptResult, result, context.writeClipboard);
      } catch (cause) {
        if (encryptStatus.textContent?.startsWith('MHFE operation stopped')) return;
        encryptStatus.classList.add('warning');
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
    decryptStatus.classList.remove('warning');
    void (async () => {
      const entropyBuffers: Uint8Array[] = [];
      try {
        const preserveFinalWord = preserveOnRecovery.checked;
        const sourceWords = selectedSourceWords();
        const pending = runWorker<DecryptionResult | AmbiguousDecryptionResult>(
          {
            type: preserveFinalWord
              ? 'decryptPreservingFinalWord'
              : sourceWords === undefined
                ? 'decryptAuto'
                : 'decryptExplicit',
            pim: selectedPim('decrypt'),
            passwordAscii: asciiPassword('decrypt'),
            container: encryptedInput.value.trim(),
            sourceWords,
          },
          decryptStatus,
          decryptStop,
          [encryptAction, decryptAction],
          preserveFinalWord
            ? (progress, elapsed) => {
                const average = elapsed / progress.iterations;
                decryptStatus.textContent = progress.matched
                  ? `Final word matched after ${progress.iterations.toLocaleString('en-US')} inverse permutations.`
                  : `Final-word recovery · ${progress.iterations.toLocaleString('en-US')} complete inverse permutations · ${formatElapsed(elapsed)} elapsed · this-device estimate: median ${formatDuration(average * 1420)}, mean ${formatDuration(average * 2048)} remaining. Stop is safe; recovery can be restarted later.`;
              }
            : undefined,
        );
        required<HTMLInputElement>('#mhfe-decrypt-password').value = '';
        const workerResult = await pending;
        const results = isAmbiguousDecryption(workerResult)
          ? workerResult.ambiguousCandidates
          : [workerResult];
        for (const result of results) {
          entropyBuffers.push(englishMnemonicToEntropy(result.recoveredMnemonic));
          if (results.length > 1) {
            const heading = document.createElement('h3');
            heading.textContent = `${result.sourceWords}-word candidate`;
            decryptResult.append(heading);
            const verification = document.createElement('div');
            verification.className = 'success-callout';
            verification.textContent = recoverySummary(result);
            decryptResult.append(verification);
          }
          renderRecoveredMnemonic(
            decryptResult,
            result.recoveredMnemonic,
            context.writeClipboard,
            context.useMnemonicInDeriver,
            context.mnemonicToSeed,
          );
        }
        const first = results[0];
        if (first === undefined) throw new Error('MHFE recovery returned no candidates.');
        decryptStatus.textContent =
          results.length > 1
            ? `Recovery found an extremely rare verifier collision. All matching candidates are shown: ${results.map((result) => result.sourceWords).join(', ')} words.`
            : `${recoverySummary(first)} PIM ${first.pim} · ${first.effectivePasses} Argon2id passes per round.${first.iterations === undefined ? '' : ` ${first.iterations.toLocaleString('en-US')} inverse permutations.`}`;
        decryptStatus.classList.toggle('warning', results.length > 1);
      } catch (cause) {
        if (decryptStatus.textContent?.startsWith('MHFE operation stopped')) return;
        decryptStatus.classList.add('warning');
        decryptStatus.textContent = cause instanceof Error ? cause.message : 'MHFE recovery failed.';
      } finally {
        for (const entropy of entropyBuffers) entropy.fill(0);
      }
    })();
  });
}
