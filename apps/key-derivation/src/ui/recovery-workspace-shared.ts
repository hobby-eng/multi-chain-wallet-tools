import type { CoinRegistry } from '@ckd/coins/registry-base.js';
import type { WalletMatcherTargetDetector } from '@ckd/recovery/matcher-types.js';
import type { RecoverySourceTarget } from './recovery-source-link.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { createQrAction } from '@ckd/ui/payment-qr.js';

export interface RecoveryFeatureContext {
  readonly registry: CoinRegistry;
  readonly detectTargets: WalletMatcherTargetDetector;
  readonly mnemonicToSeed: (mnemonic: string, passphrase: string) => Uint8Array;
  readonly writeClipboard: (value: string) => Promise<void>;
  readonly useMnemonicInDeriver: (mnemonic: string) => void;
  readonly readMnemonic: (target: RecoverySourceTarget, selector: string) => string;
  readonly linkedValue: (target: RecoverySourceTarget) => { mnemonic: string; passphrase: string } | null;
}

export function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) throw new Error(`Recovery workspace is missing ${selector}.`);
  return element;
}

export function integer(input: HTMLInputElement, label: string, minimum: number, maximum: number): number {
  const value = Number(input.value);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}

export function lines(value: string, preserveEmpty = false): string[] {
  const result = value.replaceAll('\r', '').split('\n');
  return preserveEmpty ? result : result.map((line) => line.trim()).filter(Boolean);
}

function setTab(buttons: readonly HTMLButtonElement[], panels: readonly HTMLElement[], selected: number): void {
  buttons.forEach((button, index) => {
    const active = index === selected;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
    panels[index]!.hidden = !active;
  });
}

export function installTabs(root: ParentNode, buttonSelector: string, panelSelector: string): void {
  const buttons = [...root.querySelectorAll<HTMLButtonElement>(buttonSelector)];
  const panels = [...root.querySelectorAll<HTMLElement>(panelSelector)];
  buttons.forEach((button, index) => button.addEventListener('click', () => setTab(buttons, panels, index)));
  if (buttons.length > 0) setTab(buttons, panels, 0);
}

export function installNumberedInput(textarea: HTMLTextAreaElement, gutter: HTMLElement): void {
  const update = (): void => {
    const count = Math.max(1, textarea.value.replaceAll('\r', '').split('\n').length);
    gutter.textContent = Array.from({ length: count }, (_, index) => String(index + 1)).join('\n');
    gutter.scrollTop = textarea.scrollTop;
  };
  textarea.addEventListener('input', update);
  textarea.addEventListener('scroll', update);
  update();
}

export function updateLineNumbers(textarea: HTMLTextAreaElement, gutter: HTMLElement): void {
  const count = Math.max(1, textarea.value.replaceAll('\r', '').split('\n').length);
  gutter.textContent = Array.from({ length: count }, (_, index) => String(index + 1)).join('\n');
  gutter.scrollTop = textarea.scrollTop;
}

export function installSecretToggle(
  buttonSelector: string,
  targetSelector: string,
  revealLabel: string,
  hideLabel: string,
): void {
  const button = required<HTMLButtonElement>(buttonSelector);
  const scope = button.closest<HTMLElement>('.backup-operation') ?? document.body;
  let revealed = button.getAttribute('aria-pressed') === 'true';
  const synchronize = (): void => {
    for (const target of document.querySelectorAll<HTMLElement>(targetSelector)) {
      target.classList.toggle('concealed', !revealed);
    }
    for (const action of scope.querySelectorAll<HTMLButtonElement>('.secret-copy-action')) action.disabled = !revealed;
    button.textContent = revealed ? hideLabel : revealLabel;
    button.setAttribute('aria-pressed', String(revealed));
  };
  button.addEventListener('click', () => {
    revealed = !revealed;
    synchronize();
  });
  for (const target of document.querySelectorAll<HTMLElement>(targetSelector)) {
    target.addEventListener('input', () => queueMicrotask(synchronize));
  }
  scope.addEventListener('secret-content-reset', () => {
    revealed = false;
    synchronize();
  });
  synchronize();
}

export function renderSensitiveShares(
  container: HTMLElement,
  shares: readonly string[],
  copy: (value: string) => Promise<void>,
): void {
  shares.forEach((share, index) => {
    const card = document.createElement('article');
    const title = document.createElement('strong');
    title.textContent = `Share ${index + 1}`;
    const text = document.createElement('p');
    text.className = 'concealed share-secret';
    text.textContent = share;
    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'secret-action compact secret-copy-action';
    copyButton.textContent = 'Copy share';
    copyButton.disabled = true;
    copyButton.addEventListener('click', () => void copy(share));
    const qr = createQrAction(document, share, `share ${index + 1}`, share, {
      heading: `Share ${index + 1} QR`,
      description: 'Sensitive share payload:',
      ecc: 'M',
    });
    qr.classList.add('share-qr-action');
    card.append(title, text, copyButton, qr);
    container.append(card);
  });
  const copyAll = document.createElement('button');
  copyAll.type = 'button';
  copyAll.className = 'secret-action compact secret-copy-action';
  copyAll.textContent = 'Copy all shares';
  copyAll.disabled = true;
  copyAll.addEventListener('click', () => void copy(shares.join('\n')));
  container.append(copyAll);
  container.closest<HTMLElement>('.backup-operation')?.dispatchEvent(new CustomEvent('secret-content-reset'));
}

export function renderRecoveredMnemonic(
  container: HTMLElement,
  mnemonic: string,
  copy: (value: string) => Promise<void>,
  useInDeriver: (mnemonic: string) => void,
): void {
  renderRecoveredSecret(
    container,
    mnemonic,
    { reveal: 'Reveal recovered phrase', hide: 'Hide recovered phrase', copy: 'Copy recovered phrase' },
    copy,
    undefined,
    () => useInDeriver(mnemonic),
  );
}

export function renderRecoveredSeed(
  container: HTMLElement,
  seed: Uint8Array,
  copy: (value: string) => Promise<void>,
): void {
  renderRecoveredSecret(
    container,
    bytesToHex(seed),
    { reveal: 'Reveal master seed', hide: 'Hide master seed', copy: 'Copy master seed' },
    copy,
    'Raw BIP32 master seed in hexadecimal. This is not the original BIP39 phrase.',
  );
}

function renderRecoveredSecret(
  container: HTMLElement,
  value: string,
  labels: Readonly<{ reveal: string; hide: string; copy: string }>,
  copy: (value: string) => Promise<void>,
  note?: string,
  useInDeriver?: () => void,
): void {
  const output = document.createElement('textarea');
  output.rows = 4;
  output.readOnly = true;
  output.className = 'concealed';
  output.value = value;
  const reveal = document.createElement('button');
  reveal.type = 'button';
  reveal.className = 'danger-outline compact';
  reveal.textContent = labels.reveal;
  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'secret-action compact';
  copyButton.textContent = labels.copy;
  copyButton.disabled = true;
  const actions = document.createElement('div');
  actions.className = 'actions recovered-secret-actions';
  actions.append(reveal, copyButton);
  if (useInDeriver !== undefined) {
    const useButton = document.createElement('button');
    useButton.type = 'button';
    useButton.className = 'secondary compact';
    useButton.textContent = 'Use in Derive & Generate';
    useButton.addEventListener('click', useInDeriver);
    actions.append(useButton);
  }
  reveal.addEventListener('click', () => {
    const visible = output.classList.contains('concealed');
    output.classList.toggle('concealed', !visible);
    reveal.textContent = visible ? labels.hide : labels.reveal;
    reveal.setAttribute('aria-pressed', String(visible));
    copyButton.disabled = !visible;
  });
  copyButton.addEventListener('click', () => void copy(value));
  container.append(output, actions);
  if (note !== undefined) {
    const warning = document.createElement('p');
    warning.className = 'field-note';
    warning.textContent = note;
    container.append(warning);
  }
}
