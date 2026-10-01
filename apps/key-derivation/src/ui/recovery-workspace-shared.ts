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
  readonly downloadText: (text: string, fileName: string, mimeType: string) => void;
  readonly useMnemonicInDeriver: (mnemonic: string, passphrase?: string) => void;
  readonly readMnemonic: (target: RecoverySourceTarget, selector: string) => string;
  readonly linkedValue: (target: RecoverySourceTarget) => { mnemonic: string; passphrase: string } | null;
  /** True while the phrase linked from Generate & Derive is shown in its card. */
  readonly linkedSourceRevealed: (target: RecoverySourceTarget) => boolean;
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

/** SSKR allows at most 16 groups and at most 16 shares in one group. */
const MAX_SSKR_GROUP_VALUE = 16;
/** Values of a newly added group: a common 2-of-3 split. */
const NEW_GROUP_SPEC: ThresholdGroupSpec = { threshold: 2, count: 3 };

function groupNumberInput(value: number, dataName: 'groupThreshold' | 'groupCount'): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '1';
  input.max = String(MAX_SSKR_GROUP_VALUE);
  input.value = String(value);
  input.dataset[dataName] = '';
  return input;
}

function createThresholdGroupHelp(helpText: string): HTMLDetailsElement {
  const help = document.createElement('details');
  help.className = 'threshold-group-help';
  const helpSummary = document.createElement('summary');
  helpSummary.textContent = '?';
  helpSummary.setAttribute('aria-label', 'How SSKR groups work');
  const helpPopover = document.createElement('div');
  helpPopover.className = 'threshold-group-help-popover';
  const helpTitle = document.createElement('strong');
  helpTitle.textContent = 'How SSKR groups work';
  const text = document.createElement('p');
  text.textContent = helpText;
  const warning = document.createElement('p');
  warning.className = 'threshold-group-help-warning';
  warning.textContent =
    "Shares from different groups cannot be combined to satisfy one group's Shares required threshold.";
  helpPopover.append(helpTitle, text, warning);
  help.append(helpSummary, helpPopover);
  return help;
}

type ThresholdGroupOptions = Readonly<{
  initial: readonly ThresholdGroupSpec[];
  minimumRows: 0 | 1;
  help: string;
  /**
   * "table" (SSKR): "Groups required" and one aligned table of groups under the section heading.
   * "inline" (Gordian Envelope): each group is a row of two labelled fields, compact enough for one
   * cell of the form grid next to the other Envelope fields.
   */
  layout: 'table' | 'inline';
}>;

export function installThresholdGroupEditor(selector: string, options: ThresholdGroupOptions): ThresholdGroupEditor {
  const container = required<HTMLElement>(selector);
  const rows =
    options.layout === 'inline' ? installInlineGroupRows(container, options) : installGroupTable(container, options);
  return {
    read: () =>
      [...rows.querySelectorAll<HTMLElement>('[data-threshold-group-row]')].map((row, index) => ({
        threshold: integer(
          requiredWithin<HTMLInputElement>(row, '[data-group-threshold]'),
          `Group ${index + 1} shares required`,
          1,
          MAX_SSKR_GROUP_VALUE,
        ),
        count: integer(
          requiredWithin<HTMLInputElement>(row, '[data-group-count]'),
          `Group ${index + 1} shares created`,
          1,
          MAX_SSKR_GROUP_VALUE,
        ),
      })),
  };
}

/**
 * Renders the group settings as one aligned table: the "Groups required" field written in the editor's
 * HTML comes first, then a header row names the columns once, and each group row holds "Group N", its two
 * numbers and a Remove button. The help sits next to the section heading (the `.threshold-settings-heading`
 * around the editor), and "Add group" follows the table. Returns the element that holds the group rows.
 */
function installGroupTable(container: HTMLElement, options: ThresholdGroupOptions): HTMLElement {
  const groupsRequired = container.querySelector<HTMLElement>('.threshold-groups-required');
  const table = document.createElement('div');
  table.className = 'threshold-group-table';
  const header = document.createElement('div');
  header.className = 'threshold-group-header';
  // Every input carries its own aria-label, so the visual column header is hidden from screen readers.
  header.setAttribute('aria-hidden', 'true');
  for (const text of ['Group', 'Shares required', 'Shares created', '']) {
    const cell = document.createElement('span');
    cell.textContent = text;
    header.append(cell);
  }
  const rows = document.createElement('div');
  rows.className = 'threshold-group-rows';
  if (groupsRequired !== null) table.append(groupsRequired);
  table.append(header, rows);

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'secondary compact threshold-group-add';
  add.textContent = 'Add group';

  const synchronizeRows = (): void => {
    const groupRows = [...rows.querySelectorAll<HTMLElement>('[data-threshold-group-row]')];
    header.hidden = groupRows.length === 0;
    add.disabled = groupRows.length >= MAX_SSKR_GROUP_VALUE;
    groupRows.forEach((row, index) => {
      const ordinal = index + 1;
      requiredWithin<HTMLElement>(row, '[data-group-name]').textContent = `Group ${ordinal}`;
      requiredWithin<HTMLInputElement>(row, '[data-group-threshold]').setAttribute(
        'aria-label',
        `Group ${ordinal} shares required`,
      );
      requiredWithin<HTMLInputElement>(row, '[data-group-count]').setAttribute(
        'aria-label',
        `Group ${ordinal} shares created`,
      );
      const remove = requiredWithin<HTMLButtonElement>(row, '[data-remove-threshold-group]');
      remove.setAttribute('aria-label', `Remove group ${ordinal}`);
      remove.disabled = groupRows.length <= options.minimumRows;
    });
  };
  const appendRow = (spec: ThresholdGroupSpec): void => {
    const row = document.createElement('div');
    row.className = 'threshold-group-row';
    row.dataset.thresholdGroupRow = '';
    const name = document.createElement('span');
    name.className = 'threshold-group-name';
    name.dataset.groupName = '';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'secondary compact';
    remove.dataset.removeThresholdGroup = '';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      row.remove();
      synchronizeRows();
    });
    row.append(
      name,
      groupNumberInput(spec.threshold, 'groupThreshold'),
      groupNumberInput(spec.count, 'groupCount'),
      remove,
    );
    rows.append(row);
    synchronizeRows();
  };

  const heading = container.closest('.threshold-settings')?.querySelector('.threshold-settings-heading');
  (heading ?? container).append(createThresholdGroupHelp(options.help));
  add.addEventListener('click', () => appendRow(NEW_GROUP_SPEC));
  container.replaceChildren(table, add);
  for (const spec of options.initial) appendRow(spec);
  synchronizeRows();
  return rows;
}

/** A number field with its label around it, as the inline layout shows it. */
function labelledGroupInput(
  text: string,
  value: number,
  dataName: 'groupThreshold' | 'groupCount',
  ariaLabel: string,
): HTMLLabelElement {
  const label = document.createElement('label');
  label.textContent = text;
  const input = groupNumberInput(value, dataName);
  input.setAttribute('aria-label', ariaLabel);
  label.append(input);
  return label;
}

/**
 * Builds the inline layout in `container`: one row per group with its two labelled fields and Remove,
 * then "Add group" with the help next to it. Returns the element that holds the group rows.
 */
function installInlineGroupRows(container: HTMLElement, options: ThresholdGroupOptions): HTMLElement {
  const rows = document.createElement('div');
  rows.className = 'threshold-inline-rows';
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'secondary compact';
  add.textContent = 'Add group';

  const synchronizeRemoveButtons = (): void => {
    const buttons = [...rows.querySelectorAll<HTMLButtonElement>('[data-remove-threshold-group]')];
    for (const button of buttons) button.disabled = buttons.length <= options.minimumRows;
    add.disabled = buttons.length >= MAX_SSKR_GROUP_VALUE;
  };
  const appendRow = (spec: ThresholdGroupSpec): void => {
    const row = document.createElement('div');
    row.className = 'threshold-inline-row';
    row.dataset.thresholdGroupRow = '';
    const ordinal = rows.childElementCount + 1;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'secondary compact';
    remove.dataset.removeThresholdGroup = '';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove group ${ordinal}`);
    remove.addEventListener('click', () => {
      row.remove();
      synchronizeRemoveButtons();
    });
    row.append(
      labelledGroupInput('Shares required', spec.threshold, 'groupThreshold', `Group ${ordinal} shares required`),
      labelledGroupInput('Shares created', spec.count, 'groupCount', `Group ${ordinal} shares created`),
      remove,
    );
    rows.append(row);
    synchronizeRemoveButtons();
  };

  const addRow = document.createElement('div');
  addRow.className = 'threshold-inline-add-row';
  addRow.append(add, createThresholdGroupHelp(options.help));
  add.addEventListener('click', () => appendRow(NEW_GROUP_SPEC));
  container.replaceChildren(rows, addRow);
  for (const spec of options.initial) appendRow(spec);
  synchronizeRemoveButtons();
  return rows;
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

/**
 * A Show/Hide button for concealed text. A button beside the label of its field says only "Show" or
 * "Hide", because the label already names the field; `subject` then gives screen readers the full action,
 * such as "Show container".
 */
export function installSecretToggle(
  buttonSelector: string,
  targetSelector: string,
  revealLabel: string,
  hideLabel: string,
  subject?: string,
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
    if (subject !== undefined) button.setAttribute('aria-label', `${revealed ? 'Hide' : 'Show'} ${subject}`);
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
    // A linked phrase is shown by the toggle in its card; the hidden manual field says nothing about it.
    const revealed = linked === null ? !input.classList.contains('concealed') : context.linkedSourceRevealed(target);
    updateMnemonicDiagnostic(
      diagnostic,
      linked?.mnemonic ?? input.value,
      linked?.passphrase ?? passphrase?.value ?? '',
      revealed,
      context.mnemonicToSeed,
    );
  };
  input.addEventListener('input', update);
  passphrase?.addEventListener('input', update);
  reveal.addEventListener('click', () => queueMicrotask(update));
  for (const type of ['recovery-source-change', 'recovery-source-visibility']) {
    document.addEventListener(type, (event) => {
      if (event instanceof CustomEvent && event.detail === target) update();
    });
  }
  update();
}

/**
 * Shows each share or record as a concealed card with Copy and QR. Returns the row of buttons that
 * follows the cards, so that a caller can add its own button there instead of on a line of its own:
 * with several cards it is a row holding "Copy all"; with one card, whose Copy already copies
 * everything, it is that card's own row.
 */
export function renderSensitiveShares(
  container: HTMLElement,
  shares: readonly string[],
  copy: (value: string) => Promise<void>,
  labels: readonly string[] = [],
): HTMLElement {
  let lastActions: HTMLElement | undefined;
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
    copyButton.textContent = 'Copy';
    copyButton.setAttribute('aria-label', `Copy ${label.toLowerCase()}`);
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
    lastActions = actions;
  });
  const reset = (): void => {
    container.closest<HTMLElement>('.backup-operation')?.dispatchEvent(new CustomEvent('secret-content-reset'));
  };
  if (shares.length === 1 && lastActions !== undefined) {
    reset();
    return lastActions;
  }
  const copyAll = document.createElement('button');
  copyAll.type = 'button';
  copyAll.className = 'secret-action compact secret-copy-action';
  copyAll.textContent = 'Copy all';
  copyAll.setAttribute('aria-label', labels.length > 0 ? 'Copy all records' : 'Copy all shares');
  copyAll.disabled = true;
  copyAll.addEventListener('click', () => void copy(shares.join('\n')));
  const footer = document.createElement('div');
  footer.className = 'share-secret-actions';
  footer.append(copyAll);
  container.append(footer);
  reset();
  return footer;
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
    { reveal: 'Show phrase', hide: 'Hide phrase', copy: 'Copy phrase' },
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
        reveal: 'Show passphrase',
        hide: 'Hide passphrase',
        copy: 'Copy passphrase',
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
    { reveal: 'Show seed', hide: 'Hide seed', copy: 'Copy seed' },
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
  copyButton.textContent = 'Copy';
  copyButton.setAttribute('aria-label', labels.copy);
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
