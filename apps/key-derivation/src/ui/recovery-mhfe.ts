// MHFE panel: encrypts a BIP39 phrase into a 24-word container and recovers it, with the MHFE
// 0.4.0 browser package (suite MHFE-BIP39-256-EXPERIMENTAL-3). Every operation runs in a fresh
// worker that the MHFE client terminates when it ends or is stopped, which also frees the 2 GiB
// of Argon2 memory.
import {
  MhfeClient,
  MhfeError,
  type MhfeCandidate,
  type MhfeProgress,
  type MhfeRecovery,
} from '@ckd/recovery-mhfe-wasm/client.js';
import mhfeCoreWasm from '@ckd/recovery-mhfe-wasm/mhfe_core_bg.wasm';
import { createQrAction } from '@ckd/ui/payment-qr.js';
import { installQrImageImport } from '@ckd/ui/qr-image-import.js';
import {
  installSecretToggle,
  installMnemonicSourceDiagnostic,
  renderRecoveredMnemonic,
  required,
  type RecoveryFeatureContext,
} from './recovery-workspace-shared.js';

// Texts of the package's classic scripts, embedded by build-key-derivation-html.mjs.
declare const __MHFE_WORKER_SOURCE__: string;
declare const __MHFE_ARGON2_THREADED_SOURCE__: string;
declare const __MHFE_ARGON2_SINGLE_THREADED_SOURCE__: string;

const SUITE_ID = 'MHFE-BIP39-256-EXPERIMENTAL-3';
/** A 24-word original fills the whole state and carries no verifier. */
const WORDS_WITHOUT_CHECK = 24;
const MAX_PIM = 1023;
/** The only memory level a browser supports: 2 GiB, the limit of 32-bit WebAssembly Argon2. */
const MEMORY_LEVEL = 0;
/** Rounds of one pass through the cipher; an encryption runs a second pass as its check. */
const ROUNDS_PER_STAGE = 12;

let client: MhfeClient | undefined;

/** The client is created on first use, so that a page that never uses MHFE does no work for it. */
function mhfeClient(): MhfeClient {
  client ??= new MhfeClient({
    workerSource: __MHFE_WORKER_SOURCE__,
    argon2Threaded: __MHFE_ARGON2_THREADED_SOURCE__,
    argon2SingleThreaded: __MHFE_ARGON2_SINGLE_THREADED_SOURCE__,
    coreWasm: mhfeCoreWasm,
  });
  return client;
}

function isFastMode(): boolean {
  return globalThis.crossOriginIsolated === true;
}

function paragraph(text: string, className?: string): HTMLParagraphElement {
  const element = document.createElement('p');
  element.textContent = text;
  if (className !== undefined) element.className = className;
  return element;
}

/** A text with a bold lead-in, such as "Slow mode: ...". */
function leadParagraph(lead: string, text: string): HTMLParagraphElement {
  const strong = document.createElement('strong');
  strong.textContent = lead;
  const element = document.createElement('p');
  element.append(strong, ` ${text}`);
  return element;
}

/**
 * The one warning of the MHFE panel: what MHFE is, what recovery needs, and how fast this page runs.
 * Opened as a file, the page cannot be cross-origin isolated, so the browser gives Argon2 one thread;
 * the executable version of the tool serves the same page with the headers four threads need.
 */
function renderSpeedNotice(): void {
  const notice = required<HTMLElement>('#mhfe-mode');
  const experimental = leadParagraph(
    'Experimental.',
    'MHFE has not had enough independent review to protect real funds. Recovery needs the password, and the ' +
      'PIM or memory level if you changed them.',
  );
  const speed = isFastMode()
    ? leadParagraph('Fast mode:', 'all four processor cores are in use; a recovery takes about one and a half minutes.')
    : leadParagraph(
        'Slow mode:',
        'in this HTML version the browser lets MHFE use one processor core, so a recovery takes about four to ' +
          'seven minutes. For about one and a half minutes, use the executable version of this tool.',
      );
  notice.replaceChildren(experimental, speed);
}

function selectedPim(prefix: 'encrypt' | 'decrypt'): number {
  if (!required<HTMLInputElement>(`#mhfe-${prefix}-use-pim`).checked) return 0;
  const value = Number(required<HTMLInputElement>(`#mhfe-${prefix}-pim`).value);
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_PIM) {
    throw new Error(`PIM must be a whole number from 1 to ${MAX_PIM}.`);
  }
  return value;
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

function selectedSourceWords(): 0 | 12 | 15 | 18 | 21 | 24 {
  const selected = required<HTMLSelectElement>('#mhfe-decrypt-source-words').value;
  if (selected === 'auto') return 0;
  const words = Number(selected);
  if (words === 12 || words === 15 || words === 18 || words === 21 || words === 24) return words;
  throw new Error('Select a valid original phrase length.');
}

function formatElapsed(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

/**
 * Progress for the status line: an encryption has two stages of 12 rounds, "Encrypting" and
 * "Checking", each with its own count; a recovery has one.
 */
function progressText(progress: MhfeProgress, elapsedMilliseconds: number, recovering: boolean): string {
  const checking = progress.rounds > ROUNDS_PER_STAGE && progress.round > ROUNDS_PER_STAGE;
  const stage = recovering ? 'Recovering' : checking ? 'Checking the container' : 'Encrypting';
  const round = checking ? progress.round - ROUNDS_PER_STAGE : progress.round;
  const finished = progress.round - 1;
  const perRound = finished > 0 ? elapsedMilliseconds / finished : undefined;
  const left = perRound === undefined ? '' : ` · about ${formatElapsed(perRound * (progress.rounds - finished))} left`;
  return `${stage} · round ${round} of ${ROUNDS_PER_STAGE} · ${formatElapsed(elapsedMilliseconds)} elapsed${left}`;
}

/** Runs one operation with its Stop button shown and both actions disabled meanwhile. */
async function runOperation<T>(
  stop: HTMLButtonElement,
  actions: readonly HTMLButtonElement[],
  operation: () => Promise<T>,
): Promise<T> {
  for (const action of actions) action.disabled = true;
  stop.hidden = false;
  stop.onclick = () => mhfeClient().cancel();
  try {
    return await operation();
  } finally {
    stop.hidden = true;
    stop.onclick = null;
    for (const action of actions) action.disabled = false;
  }
}

/** Error text for the status line: the client's codes carry a message written for people. */
function describe(cause: unknown, fallback: string): string {
  if (cause instanceof MhfeError && cause.code === 'CANCELLED')
    return 'Stopped. The worker and its memory were discarded.';
  return cause instanceof Error ? cause.message : fallback;
}

interface ContainerCard {
  readonly element: HTMLElement;
  readonly state: HTMLElement;
}

/**
 * The container, shown as soon as the first 12 rounds are done so that writing it down overlaps
 * the check. Its state line says clearly that it is not verified until the check ends.
 */
function renderContainer(
  target: HTMLElement,
  container: string,
  words: number,
  lengthMustBeChosen: boolean,
  pim: number,
  copy: (value: string) => Promise<void>,
): ContainerCard {
  const card = document.createElement('article');
  const title = document.createElement('strong');
  title.textContent = 'Encrypted 24-word MHFE container';
  const state = document.createElement('div');
  state.className = 'warning-callout';
  state.textContent =
    'Not verified yet. MHFE now decrypts the container again to make sure that no memory error or other fault ' +
    'changed it. You can start writing it down, but wait for the result before you rely on it.';
  const output = document.createElement('textarea');
  output.rows = 4;
  output.readOnly = true;
  output.className = 'concealed share-secret';
  output.value = container;
  const reveal = document.createElement('button');
  reveal.type = 'button';
  reveal.className = 'danger-outline compact';
  reveal.textContent = 'Show container';
  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'secret-action compact';
  copyButton.textContent = 'Copy';
  copyButton.setAttribute('aria-label', 'Copy encrypted container');
  copyButton.disabled = true;
  reveal.addEventListener('click', () => {
    const visible = output.classList.contains('concealed');
    output.classList.toggle('concealed', !visible);
    reveal.textContent = visible ? 'Hide container' : 'Show container';
    reveal.setAttribute('aria-pressed', String(visible));
    copyButton.disabled = !visible;
  });
  copyButton.addEventListener('click', () => void copy(container));
  const qr = createQrAction(document, container, 'MHFE encrypted container', container, {
    heading: 'Encrypted MHFE container QR',
    description: 'Checksum-valid 24-word BIP39 container:',
    ecc: 'M',
  });
  const actions = document.createElement('div');
  actions.className = 'share-secret-actions';
  actions.append(reveal, copyButton, qr);
  const keep = paragraph(rememberNote(words, lengthMustBeChosen, pim), 'field-note');
  card.append(title, state, output, actions, keep);
  target.replaceChildren(card);
  return { element: card, state };
}

/**
 * The suite, which the specification requires to be shown, and what recovery needs besides the
 * container and the password: a PIM other than the default (the page supports only memory level 0),
 * and, for the rare phrase that automatic length detection would misread, its word count.
 */
function rememberNote(words: number, lengthMustBeChosen: boolean, pim: number): string {
  const notes: string[] = [];
  if (pim === 0 && !lengthMustBeChosen) {
    notes.push('Nothing else needs to be kept: the 24 words and the password are enough.');
  }
  if (pim !== 0) {
    notes.push(
      `You changed the default settings; remember them: PIM ${pim}. Recovery needs exactly this value: ` +
        'with another the container turns into a different phrase that looks just as valid.',
    );
  }
  if (lengthMustBeChosen) {
    notes.push(
      `Remember the word count: your phrase has ${words} words. As said above, automatic length detection ` +
        'would misread this phrase; select that length when you recover.',
    );
  }
  if (words === WORDS_WITHOUT_CHECK) {
    notes.push(
      'A 24-word phrase has no built-in check, so recovery will show it as not verified; that is expected. ' +
        'Compare a known address of the wallet to confirm it.',
    );
  }
  return (
    `Suite ${SUITE_ID}. ${notes.join(' ')} Use a different password for each phrase you encrypt, and ` +
    'nowhere else; to make another copy, copy these 24 words exactly. Before relying on the container, ' +
    'rehearse the recovery in Decode with the words typed from the plate or paper you wrote, not from the ' +
    'screen, and compare the result with your wallet: a wrongly copied word can still pass the BIP39 checksum.'
  );
}

function recoverySummary(candidate: MhfeCandidate, selectedWords: number): string {
  if (candidate.verified) {
    return `Recovered · ${candidate.words} words · the built-in check passed: the password and settings are right. It does not confirm the wallet; compare a receiving address.`;
  }
  if (selectedWords === 24) {
    return 'Not verified: recovered as 24 words, as selected. A 24-word phrase has no built-in check, so any password gives a valid phrase: compare it with your wallet.';
  }
  return (
    'Not verified: no shorter length passed its check, so the result is read as 24 words. If your original has ' +
    '24 words, compare this phrase with your wallet. If it has fewer, this usually means a wrong password, PIM ' +
    'or container.'
  );
}

export function installMhfe(context: RecoveryFeatureContext): void {
  renderSpeedNotice();
  installSecretToggle('#toggle-mhfe-source', '#mhfe-source', 'Show', 'Hide', 'recovery phrase');
  installMnemonicSourceDiagnostic(context, 'mhfe', '#mhfe-source', '#toggle-mhfe-source');
  installSecretToggle('#toggle-mhfe-container', '#mhfe-container', 'Show', 'Hide', 'container');
  installPimToggle('encrypt');
  installPimToggle('decrypt');
  installPasswordToggle('#toggle-mhfe-encrypt-password', '#mhfe-encrypt-password', 'MHFE password');
  installPasswordToggle(
    '#toggle-mhfe-encrypt-password-confirm',
    '#mhfe-encrypt-password-confirm',
    'password confirmation',
  );
  installPasswordToggle('#toggle-mhfe-decrypt-password', '#mhfe-decrypt-password', 'MHFE password');
  const encryptedInput = required<HTMLTextAreaElement>('#mhfe-container');
  installQrImageImport(document, encryptedInput, {
    label: 'Import QR image',
    onDecoded: (decoded) => decoded.text.trim(),
    onError: (message) => {
      required<HTMLElement>('#mhfe-decrypt-status').textContent = message;
    },
  });

  const encryptAction = required<HTMLButtonElement>('#mhfe-encrypt');
  const encryptStop = required<HTMLButtonElement>('#mhfe-encrypt-stop');
  const encryptStatus = required<HTMLElement>('#mhfe-encrypt-status');
  const encryptResult = required<HTMLElement>('#mhfe-encrypt-result');
  const decryptAction = required<HTMLButtonElement>('#mhfe-decrypt');
  const decryptStop = required<HTMLButtonElement>('#mhfe-decrypt-stop');
  const decryptStatus = required<HTMLElement>('#mhfe-decrypt-status');
  const decryptResult = required<HTMLElement>('#mhfe-decrypt-result');

  encryptAction.addEventListener('click', () => {
    encryptResult.replaceChildren();
    encryptStatus.classList.remove('warning');
    const passwordInput = required<HTMLInputElement>('#mhfe-encrypt-password');
    const repeatInput = required<HTMLInputElement>('#mhfe-encrypt-password-confirm');
    let card: ContainerCard | undefined;
    void runOperation(encryptStop, [encryptAction, decryptAction], async () => {
      try {
        const pim = selectedPim('encrypt');
        const password = passwordInput.value;
        const passwordRepeat = repeatInput.value;
        if (password !== passwordRepeat) throw new Error('The two passwords differ. Type them again.');
        const source = context.readMnemonic('mhfe', '#mhfe-source').trim();
        const read = await mhfeClient().readPhrase(source);
        // About one phrase in four billion also passes the check of another length; automatic
        // detection would then not give it back on its own.
        const lengthNote =
          read.otherLengths.length === 0
            ? ''
            : ` Write down that your phrase has ${read.words} words and select that length when you recover: ` +
              `by chance it also passes the check of ${read.otherLengths.join(' and ')} words.`;
        const started = performance.now();
        encryptStatus.textContent = `Starting · ${read.words}-word phrase accepted.${lengthNote}`;
        const pending = mhfeClient().encrypt({
          phrase: source,
          password,
          passwordRepeat,
          pim,
          memoryLevel: MEMORY_LEVEL,
          onProgress: (progress) => {
            encryptStatus.textContent = progressText(progress, performance.now() - started, false) + lengthNote;
          },
          onUnverified: ({ container }) => {
            card = renderContainer(
              encryptResult,
              container,
              read.words,
              read.otherLengths.length > 0,
              pim,
              context.writeClipboard,
            );
          },
        });
        // The client holds its own copies now; the fields need not keep the password.
        passwordInput.value = '';
        repeatInput.value = '';
        const { container } = await pending;
        card ??= renderContainer(
          encryptResult,
          container,
          read.words,
          read.otherLengths.length > 0,
          pim,
          context.writeClipboard,
        );
        card.state.className = 'success-callout';
        card.state.textContent = 'Verified: the container turns back into your original phrase.';
        encryptStatus.textContent = `Encryption complete in ${formatElapsed(performance.now() - started)}.${lengthNote}`;
        encryptStatus.classList.toggle('warning', lengthNote !== '');
      } catch (cause) {
        encryptStatus.classList.add('warning');
        encryptStatus.textContent = describe(cause, 'MHFE encryption failed.');
        if (card === undefined) return;
        card.state.className = 'warning-callout';
        card.state.textContent =
          cause instanceof MhfeError && cause.code === 'VERIFICATION_FAILED'
            ? 'This container is WRONG: it did not turn back into your phrase. Do not use it; cross it out if you ' +
              'wrote it down, and encrypt again.'
            : 'The check did not finish: this container is NOT verified. Do not rely on it; encrypt again.';
      }
    });
  });

  decryptAction.addEventListener('click', () => {
    decryptResult.replaceChildren();
    decryptStatus.classList.remove('warning');
    const passwordInput = required<HTMLInputElement>('#mhfe-decrypt-password');
    void runOperation(decryptStop, [encryptAction, decryptAction], async () => {
      try {
        const pim = selectedPim('decrypt');
        const words = selectedSourceWords();
        const { container } = await mhfeClient().readContainer(encryptedInput.value);
        const started = performance.now();
        const pending = mhfeClient().decrypt({
          container,
          password: passwordInput.value,
          pim,
          memoryLevel: MEMORY_LEVEL,
          words,
          onProgress: (progress) => {
            decryptStatus.textContent = progressText(progress, performance.now() - started, true);
          },
        });
        passwordInput.value = '';
        const recovery: MhfeRecovery = await pending;
        for (const candidate of recovery.candidates) {
          const summary = document.createElement('div');
          summary.className = candidate.verified ? 'success-callout' : 'warning-callout';
          summary.textContent = recoverySummary(candidate, words);
          if (recovery.kind === 'ambiguous') {
            const heading = document.createElement('h3');
            heading.textContent = `${candidate.words}-word candidate`;
            decryptResult.append(heading);
          }
          decryptResult.append(summary);
          renderRecoveredMnemonic(
            decryptResult,
            candidate.phrase,
            context.writeClipboard,
            context.useMnemonicInDeriver,
            context.mnemonicToSeed,
          );
        }
        decryptStatus.textContent =
          recovery.kind === 'ambiguous'
            ? 'Several lengths passed their check, which happens by accident for about one container in four ' +
              'billion. Every candidate is shown: compare each with your wallet, or select the known length.'
            : `Recovery complete in ${formatElapsed(performance.now() - started)}.`;
        decryptStatus.classList.toggle('warning', recovery.kind === 'ambiguous');
      } catch (cause) {
        decryptStatus.classList.add('warning');
        decryptStatus.textContent = describe(cause, 'MHFE recovery failed.');
      }
    });
  });
}
