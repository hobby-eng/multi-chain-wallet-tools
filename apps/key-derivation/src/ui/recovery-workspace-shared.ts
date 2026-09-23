import type { CoinRegistry } from '@ckd/coins/registry-base.js';
import type { WalletMatcherTargetDetector } from '@ckd/recovery/matcher-types.js';
import type { RecoverySourceTarget } from './recovery-source-link.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { createQrAction } from '@ckd/ui/payment-qr.js';
import { diagnoseMnemonic, masterFingerprintFromSeed } from '@ckd/core/bip39.js';
import { renderSeedDiagnostic } from './seed-diagnostic-view.js';

export interface RecoveryFeatureContext {
  readonly registry: CoinRegistry;
  readonly detectTargets: WalletMatcherTargetDetector;
  readonly mnemonicToSeed: (mnemonic: string, passphrase: string) => Uint8Array;
  readonly writeClipboard: (value: string) => Promise<void>;
  readonly useMnemonicInDeriver: (mnemonic: string, passphrase?: string) => void;
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

interface ThresholdGroupSpec {
  readonly threshold: number;
  readonly count: number;
}

interface ThresholdGroupEditor {
  read(): ThresholdGroupSpec[];
}

export function installThresholdGroupEditor(
  selector: string,
  options: Readonly<{
    initial: readonly ThresholdGroupSpec[];
    minimumRows: 0 | 1;
    addLabel: string;
    help: string;
  }>,
): ThresholdGroupEditor {
  const container = required<HTMLElement>(selector);
  const rows = document.createElement('div');
  rows.className = 'threshold-group-rows';
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'secondary compact';
  add.textContent = options.addLabel;

  const synchronizeRemoveButtons = (): void => {
    const buttons = [...rows.querySelectorAll<HTMLButtonElement>('[data-remove-threshold-group]')];
    for (const button of buttons) button.disabled = buttons.length <= options.minimumRows;
  };
  const appendRow = (spec: ThresholdGroupSpec): void => {
    const row = document.createElement('div');
    row.className = 'threshold-group-row';
    row.dataset.thresholdGroupRow = '';
    const ordinal = rows.childElementCount + 1;
    const requiredLabel = document.createElement('label');
    requiredLabel.textContent = 'Shares required';
    const threshold = document.createElement('input');
    threshold.type = 'number';
    threshold.min = '1';
    threshold.max = '16';
    threshold.value = String(spec.threshold);
    threshold.dataset.groupThreshold = '';
    threshold.setAttribute('aria-label', `Group ${ordinal} shares required`);
    requiredLabel.append(threshold);
    const createdLabel = document.createElement('label');
    createdLabel.textContent = 'Shares created';
    const count = document.createElement('input');
    count.type = 'number';
    count.min = '1';
    count.max = '16';
    count.value = String(spec.count);
    count.dataset.groupCount = '';
    count.setAttribute('aria-label', `Group ${ordinal} shares created`);
    createdLabel.append(count);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'secondary compact';
    remove.dataset.removeThresholdGroup = '';
    remove.textContent = 'Remove group';
    remove.addEventListener('click', () => {
      row.remove();
      synchronizeRemoveButtons();
    });
    row.append(requiredLabel, createdLabel, remove);
    rows.append(row);
    synchronizeRemoveButtons();
  };

  const addRow = document.createElement('div');
  addRow.className = 'threshold-group-add-row';
  const help = document.createElement('details');
  help.className = 'threshold-group-help';
  const helpSummary = document.createElement('summary');
  helpSummary.textContent = '?';
  helpSummary.setAttribute('aria-label', 'How SSKR groups work');
  const helpPopover = document.createElement('div');
  helpPopover.className = 'threshold-group-help-popover';
  const helpTitle = document.createElement('strong');
  helpTitle.textContent = 'How SSKR groups work';
  const helpText = document.createElement('p');
  helpText.textContent = options.help;
  const warning = document.createElement('p');
  warning.className = 'threshold-group-help-warning';
  warning.textContent =
    "Shares from different groups cannot be combined to satisfy one group's Shares required threshold.";
  helpPopover.append(helpTitle, helpText, warning);
  help.append(helpSummary, helpPopover);
  addRow.append(add, help);

  add.addEventListener('click', () => appendRow({ threshold: 2, count: 3 }));
  container.replaceChildren(rows, addRow);
  for (const spec of options.initial) appendRow(spec);

  return {
    read: () =>
      [...rows.querySelectorAll<HTMLElement>('[data-threshold-group-row]')].map((row, index) => ({
        threshold: integer(
          requiredWithin<HTMLInputElement>(row, '[data-group-threshold]'),
          `Group ${index + 1} shares required`,
          1,
          16,
        ),
        count: integer(
          requiredWithin<HTMLInputElement>(row, '[data-group-count]'),
          `Group ${index + 1} shares created`,
          1,
          16,
        ),
      })),
  };
}

function requiredWithin<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (element === null) throw new Error(`Recovery workspace is missing ${selector}.`);
  return element;
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

function createSeedDiagnosticElement(): HTMLElement {
  const diagnostic = document.createElement('section');
  diagnostic.className = 'seed-diagnostic recovered-seed-diagnostic';
  const diagnosticHead = document.createElement('div');
  diagnosticHead.className = 'seed-diagnostic-head';
  const diagnosticTitle = document.createElement('h3');
  diagnosticTitle.textContent = 'Seed Diagnostic';
  const diagnosticScope = document.createElement('span');
  diagnosticScope.textContent = 'Local · no network';
  diagnosticHead.append(diagnosticTitle, diagnosticScope);
  diagnostic.append(diagnosticHead);
  return diagnostic;
}

function updateMnemonicDiagnostic(
  diagnostic: HTMLElement,
  mnemonic: string,
  passphrase: string,
  revealed: boolean,
  mnemonicToSeed: (mnemonic: string, passphrase: string) => Uint8Array,
): void {
  const report = diagnoseMnemonic(mnemonic);
  let seed: Uint8Array | null = null;
  let fingerprint: string | null = null;
  if (report.checksumValid) {
    try {
      seed = mnemonicToSeed(mnemonic, passphrase);
      fingerprint = masterFingerprintFromSeed(seed);
    } finally {
      seed?.fill(0);
    }
  }
  renderSeedDiagnostic(document, diagnostic, report, fingerprint, revealed);
}

export function installMnemonicSourceDiagnostic(
  context: RecoveryFeatureContext,
  target: Exclude<RecoverySourceTarget, 'matcher'>,
  inputSelector: string,
  revealButtonSelector: string,
  passphraseSelector?: string,
): void {
  const input = required<HTMLTextAreaElement>(inputSelector);
  const reveal = required<HTMLButtonElement>(revealButtonSelector);
  const passphrase = passphraseSelector === undefined ? null : required<HTMLInputElement>(passphraseSelector);
  const diagnostic = createSeedDiagnosticElement();
  input.after(diagnostic);
  const update = (): void => {
    const linked = context.linkedValue(target);
    updateMnemonicDiagnostic(
      diagnostic,
      linked?.mnemonic ?? input.value,
      linked?.passphrase ?? passphrase?.value ?? '',
      !input.classList.contains('concealed'),
      context.mnemonicToSeed,
    );
  };
  input.addEventListener('input', update);
  passphrase?.addEventListener('input', update);
  reveal.addEventListener('click', () => queueMicrotask(update));
  document.addEventListener('recovery-source-change', (event) => {
    if (event instanceof CustomEvent && event.detail === target) update();
  });
  update();
}

export function renderSensitiveShares(
  container: HTMLElement,
  shares: readonly string[],
  copy: (value: string) => Promise<void>,
  labels: readonly string[] = [],
): void {
  shares.forEach((share, index) => {
    const card = document.createElement('article');
    const title = document.createElement('strong');
    const label = labels[index] ?? `Share ${index + 1}`;
    title.textContent = label;
    const text = document.createElement('p');
    text.className = 'concealed share-secret';
    text.textContent = share;
    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'secret-action compact secret-copy-action';
    copyButton.textContent = `Copy ${label.toLowerCase()}`;
    copyButton.disabled = true;
    copyButton.addEventListener('click', () => void copy(share));
    const qr = createQrAction(document, share, label.toLowerCase(), share, {
      heading: `${label} QR`,
      description: 'Sensitive payload:',
      ecc: 'M',
    });
    qr.classList.add('share-qr-action');
    const actions = document.createElement('div');
    actions.className = 'share-secret-actions';
    actions.append(copyButton, qr);
    card.append(title, text, actions);
    container.append(card);
  });
  const copyAll = document.createElement('button');
  copyAll.type = 'button';
  copyAll.className = 'secret-action compact secret-copy-action';
  copyAll.textContent = labels.length > 0 ? 'Copy all records' : 'Copy all shares';
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
  mnemonicToSeed: (mnemonic: string, passphrase: string) => Uint8Array,
  diagnosticPassphrase = '',
): void {
  const diagnostic = createSeedDiagnosticElement();
  diagnostic.hidden = true;
  const diagnosticHead = diagnostic.firstElementChild!;
  const updateDiagnostic = (revealed: boolean): void => {
    if (!revealed) {
      diagnostic.hidden = true;
      diagnostic.replaceChildren(diagnosticHead);
      return;
    }
    updateMnemonicDiagnostic(diagnostic, mnemonic, diagnosticPassphrase, true, mnemonicToSeed);
    diagnostic.hidden = false;
  };
  renderRecoveredSecret(
    container,
    mnemonic,
    { reveal: 'Reveal recovered phrase', hide: 'Hide recovered phrase', copy: 'Copy recovered phrase' },
    copy,
    undefined,
    () => useInDeriver(mnemonic),
    updateDiagnostic,
  );
  container.append(diagnostic);
}

export function renderRecoveredMnemonicBundle(
  container: HTMLElement,
  mnemonic: string,
  bip39Passphrase: string | undefined,
  copy: (value: string) => Promise<void>,
  useInDeriver: (mnemonic: string, passphrase?: string) => void,
  mnemonicToSeed: (mnemonic: string, passphrase: string) => Uint8Array,
): void {
  renderRecoveredMnemonic(
    container,
    mnemonic,
    copy,
    (value) => useInDeriver(value, bip39Passphrase),
    mnemonicToSeed,
    bip39Passphrase ?? '',
  );
  if (bip39Passphrase !== undefined) {
    renderRecoveredSecret(
      container,
      bip39Passphrase,
      {
        reveal: 'Reveal recovered BIP39 passphrase',
        hide: 'Hide recovered BIP39 passphrase',
        copy: 'Copy recovered BIP39 passphrase',
      },
      copy,
      'This passphrase was stored inside the encrypted Seed Envelope content.',
    );
  }
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
  onVisibilityChange?: (revealed: boolean) => void,
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
    useButton.textContent = 'Use in Generate & Derive';
    useButton.addEventListener('click', useInDeriver);
    actions.append(useButton);
  }
  reveal.addEventListener('click', () => {
    const visible = output.classList.contains('concealed');
    output.classList.toggle('concealed', !visible);
    reveal.textContent = visible ? labels.hide : labels.reveal;
    reveal.setAttribute('aria-pressed', String(visible));
    copyButton.disabled = !visible;
    onVisibilityChange?.(visible);
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
