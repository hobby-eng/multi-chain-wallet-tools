import {
  decodeMnemoCode,
  encodeMnemoCode,
  MNEMOCODE_VERSION,
  parseMnemoCodeDates,
  recoverMnemoCodeLegacyLastWords,
  recoverMnemoCodeWord,
  type MnemoCodeFormat,
  type MnemoCodeMissingWordCandidate,
  type MnemoCodeMode,
} from '@ckd/recovery-backup/mnemocode.js';
import { installQrImageImport } from '@ckd/ui/qr-image-import.js';
import {
  MNEMOCODE_AUTO_FORMAT_HELP,
  MNEMOCODE_DECODE_MODE_HELP,
  MNEMOCODE_FORMAT_HELP,
  MNEMOCODE_MODE_HELP,
  MNEMOCODE_WORD_HELP,
  renderMnemoCodeHelp,
  type MnemoCodeHelp,
} from './recovery-mnemocode-help.js';
import {
  installMnemonicSourceDiagnostic,
  installSecretToggle,
  renderRecoveredMnemonic,
  renderSensitiveShares,
  required,
  type RecoveryFeatureContext,
} from './recovery-workspace-shared.js';

function selectedMode(selector: string): MnemoCodeMode {
  return required<HTMLSelectElement>(selector).value as MnemoCodeMode;
}

function selectedFormat(selector: string): MnemoCodeFormat {
  return required<HTMLSelectElement>(selector).value as MnemoCodeFormat;
}

function dates(selector: string, mode: MnemoCodeMode) {
  // Direct mode has no dates; text left in the hidden field is ignored.
  if (mode === 'direct') return [];
  return parseMnemoCodeDates(required<HTMLTextAreaElement>(selector).value);
}

function synchronizeDateField(select: HTMLSelectElement, container: HTMLElement): void {
  const update = (): void => {
    container.hidden = select.value === 'direct';
  };
  select.addEventListener('change', update);
  update();
}

/** Keeps the "How it works" popover in step with the selected option. */
function installOptionHelp(
  control: HTMLSelectElement | HTMLInputElement,
  helpSelector: string,
  helpFor: (value: string, checked: boolean) => MnemoCodeHelp | undefined,
): void {
  const popover = required<HTMLElement>(`${helpSelector} .recovery-help-popover`);
  const update = (): void => {
    const checked = control instanceof HTMLInputElement && control.checked;
    const help = helpFor(control.value, checked);
    if (help !== undefined) renderMnemoCodeHelp(popover, help);
  };
  control.addEventListener('change', update);
  update();
}

function appendMetadata(container: HTMLElement, mode: MnemoCodeMode, format: MnemoCodeFormat): void {
  const metadata = document.createElement('p');
  metadata.className = 'field-note';
  metadata.textContent = `MnemoCode ${MNEMOCODE_VERSION} · mode ${mode} · ${formatLabel(format)}. Dates are not stored in the record.`;
  container.append(metadata);
}

function formatLabel(format: MnemoCodeFormat): string {
  switch (format) {
    case 'english':
      return 'English BIP39 words';
    case 'indexes':
      return 'BIP39 word numbers (1–2048)';
    case 'unicode':
      return 'mapped Unicode code points';
    case 'colors':
      return '#RRGGBB colors';
    case 'colors-unicode':
      return 'color Unicode code points';
  }
}

function mncFileName(mode: MnemoCodeMode, format: MnemoCodeFormat): string {
  return `mnemocode-${MNEMOCODE_VERSION}-${mode}-${format}.mnc`;
}

function appendPalette(container: HTMLElement, colors: readonly string[]): void {
  const palette = document.createElement('div');
  palette.className = 'mnemocode-palette concealed share-secret';
  palette.setAttribute('aria-label', 'Exact MnemoCode color references');
  for (const color of colors) {
    const swatch = document.createElement('div');
    swatch.className = 'mnemocode-swatch';
    swatch.style.setProperty('--mnemocode-color', color);
    const reference = document.createElement('code');
    reference.textContent = color;
    swatch.append(reference);
    palette.append(swatch);
  }
  container.append(palette);
}

interface ConcealedText {
  readonly value: string;
  readonly rows: number;
  /** What the text is, for the button labels: "Show <subject>" and "Hide <subject>". */
  readonly subject: string;
  readonly copyLabel: string;
  readonly extraClass?: string;
  readonly copy: (value: string) => Promise<void>;
}

/** A read-only text that stays concealed until it is revealed; it can be copied only while revealed. */
function concealedText({ value, rows, subject, copyLabel, extraClass, copy }: ConcealedText): HTMLElement[] {
  const output = document.createElement('textarea');
  output.rows = rows;
  output.readOnly = true;
  output.className = extraClass === undefined ? 'concealed' : `concealed ${extraClass}`;
  output.value = value;
  const reveal = document.createElement('button');
  reveal.type = 'button';
  reveal.className = 'danger-outline compact';
  reveal.textContent = `Show ${subject}`;
  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'secret-action compact';
  copyButton.textContent = copyLabel;
  copyButton.disabled = true;
  reveal.addEventListener('click', () => {
    const visible = output.classList.contains('concealed');
    output.classList.toggle('concealed', !visible);
    reveal.textContent = visible ? `Hide ${subject}` : `Show ${subject}`;
    reveal.setAttribute('aria-pressed', String(visible));
    copyButton.disabled = !visible;
  });
  copyButton.addEventListener('click', () => void copy(value));
  const actions = document.createElement('div');
  actions.className = 'actions';
  actions.append(reveal, copyButton);
  return [output, actions];
}

function renderInvalidMnemonic(container: HTMLElement, mnemonic: string, copy: (value: string) => Promise<void>): void {
  const warning = document.createElement('div');
  warning.className = 'warning-callout';
  warning.textContent =
    'The recovered legacy phrase has an invalid BIP39 checksum. Check the dates and input before using it.';
  container.append(
    warning,
    ...concealedText({
      value: mnemonic,
      rows: 4,
      subject: 'phrase',
      copyLabel: 'Copy phrase',
      copy,
    }),
  );
}

function renderCandidates(
  container: HTMLElement,
  candidates: readonly string[],
  copy: (value: string) => Promise<void>,
): void {
  const warning = document.createElement('div');
  warning.className = 'warning-callout';
  warning.textContent =
    `${candidates.length} checksum-valid candidates were recovered. ` +
    'A legacy checksum-word replacement discarded information; use independent wallet evidence to identify the original.';
  container.append(
    warning,
    ...concealedText({
      value: candidates.map((candidate, index) => `${index + 1}\t${candidate}`).join('\n'),
      rows: Math.min(12, Math.max(5, candidates.length)),
      subject: 'candidates',
      copyLabel: 'Copy all',
      copy,
    }),
  );
}

function renderMissingWordCandidates(
  container: HTMLElement,
  candidates: readonly MnemoCodeMissingWordCandidate[],
  copy: (value: string) => Promise<void>,
  legacyReplacement = false,
): void {
  const summary = document.createElement('div');
  summary.className = 'warning-callout';
  if (candidates.length === 0) {
    summary.textContent =
      'No checksum-valid BIP39 phrase matches the supplied known words. Check the other words, their order, and the placeholder position.';
    container.append(summary);
    return;
  }
  summary.textContent = legacyReplacement
    ? `${candidates.length} checksum-valid final-word replacements were found. The row marked preserved retains the entropy-bearing bits of the supplied old final word. These are replacement containers, not proof of the original wallet.`
    : `${candidates.length} checksum-valid replacements were found for word ${candidates[0]!.position}. A valid checksum does not identify the intended wallet; verify it with independent public wallet evidence.`;
  const options = document.createElement('textarea');
  options.rows = Math.min(14, Math.max(5, candidates.length));
  options.readOnly = true;
  options.className = 'mnemocode-word-options';
  options.setAttribute('aria-label', 'Checksum-valid BIP39 word replacements');
  options.value = [
    `candidate\tword\tword-index\tchecksum-bits${legacyReplacement ? '\tlegacy-tail' : ''}`,
    ...candidates.map(
      (candidate, index) =>
        `${index + 1}\t${candidate.word}\t${candidate.wordIndex}\t${candidate.checksumBits}${
          legacyReplacement ? `\t${candidate.preservesLegacyEntropy ? 'preserved' : 'alternative'}` : ''
        }`,
    ),
  ].join('\n');
  container.append(
    summary,
    options,
    ...concealedText({
      value: [
        `candidate\tword\tword-index\tchecksum-bits${legacyReplacement ? '\tlegacy-tail' : ''}\tmnemonic`,
        ...candidates.map(
          (candidate, index) =>
            `${index + 1}\t${candidate.word}\t${candidate.wordIndex}\t${candidate.checksumBits}${
              legacyReplacement ? `\t${candidate.preservesLegacyEntropy ? 'preserved' : 'alternative'}` : ''
            }\t${candidate.mnemonic}`,
        ),
      ].join('\n'),
      rows: Math.min(14, Math.max(5, candidates.length)),
      subject: 'phrases',
      copyLabel: 'Copy all',
      extraClass: 'mnemocode-word-phrases',
      copy,
    }),
  );
}

export function installMnemoCode(context: RecoveryFeatureContext): void {
  installSecretToggle('#toggle-mnemocode-source', '#mnemocode-source', 'Show phrase', 'Hide phrase');
  installMnemonicSourceDiagnostic(context, 'mnemocode', '#mnemocode-source', '#toggle-mnemocode-source');
  installSecretToggle(
    '#toggle-mnemocode-created',
    '#mnemocode-encode-result .share-secret',
    'Show records',
    'Hide records',
  );
  installSecretToggle('#toggle-mnemocode-input', '#mnemocode-input', 'Show input', 'Hide input');
  installSecretToggle(
    '#toggle-mnemocode-missing-word-input',
    '#mnemocode-missing-word-input',
    'Show phrase',
    'Hide phrase',
  );

  const encodeMode = required<HTMLSelectElement>('#mnemocode-encode-mode');
  synchronizeDateField(encodeMode, required<HTMLElement>('#mnemocode-encode-dates-field'));
  installOptionHelp(encodeMode, '#mnemocode-mode-help', (value) => MNEMOCODE_MODE_HELP[value as MnemoCodeMode]);
  installOptionHelp(
    required<HTMLSelectElement>('#mnemocode-encode-format'),
    '#mnemocode-format-help',
    (value) => MNEMOCODE_FORMAT_HELP[value as MnemoCodeFormat],
  );

  installOptionHelp(
    required<HTMLSelectElement>('#mnemocode-decode-mode'),
    '#mnemocode-decode-mode-help',
    (value) => MNEMOCODE_DECODE_MODE_HELP[value as MnemoCodeMode],
  );
  installOptionHelp(
    required<HTMLSelectElement>('#mnemocode-decode-format'),
    '#mnemocode-decode-format-help',
    (value) => (value === 'auto' ? MNEMOCODE_AUTO_FORMAT_HELP : MNEMOCODE_FORMAT_HELP[value as MnemoCodeFormat]),
  );
  installOptionHelp(required<HTMLInputElement>('#mnemocode-legacy-last-word'), '#mnemocode-word-help', (_, checked) =>
    checked ? MNEMOCODE_WORD_HELP.legacy : MNEMOCODE_WORD_HELP.missing,
  );

  const decodeInput = required<HTMLTextAreaElement>('#mnemocode-input');
  const decodeResult = required<HTMLElement>('#mnemocode-decode-result');
  installQrImageImport(document, decodeInput, {
    onDecoded(decoded) {
      return decoded.text.trim();
    },
    onError(message) {
      decodeResult.textContent = message;
    },
  });

  const encodeResult = required<HTMLElement>('#mnemocode-encode-result');
  const clearEncodeResult = (): void => {
    encodeResult.replaceChildren();
    encodeResult.closest<HTMLElement>('.backup-operation')?.dispatchEvent(new CustomEvent('secret-content-reset'));
  };
  const encodeDates = required<HTMLTextAreaElement>('#mnemocode-encode-dates');
  const encodeFormat = required<HTMLSelectElement>('#mnemocode-encode-format');
  required<HTMLTextAreaElement>('#mnemocode-source').addEventListener('input', clearEncodeResult);
  encodeDates.addEventListener('input', clearEncodeResult);
  encodeMode.addEventListener('change', clearEncodeResult);
  encodeFormat.addEventListener('change', clearEncodeResult);
  document.addEventListener('recovery-source-change', (event) => {
    if (event instanceof CustomEvent && event.detail === 'mnemocode') clearEncodeResult();
  });
  required<HTMLButtonElement>('#encode-mnemocode').addEventListener('click', () => {
    clearEncodeResult();
    try {
      const mode = selectedMode('#mnemocode-encode-mode');
      const format = selectedFormat('#mnemocode-encode-format');
      const result = encodeMnemoCode(
        context.readMnemonic('mnemocode', '#mnemocode-source'),
        mode,
        format,
        dates('#mnemocode-encode-dates', mode),
      );
      appendMetadata(encodeResult, result.mode, result.format);
      if (!result.checksumValid) {
        const warning = document.createElement('div');
        warning.className = 'warning-callout';
        warning.textContent =
          'Legacy Seedshift can produce a representation whose English form has an invalid BIP39 checksum.';
        encodeResult.append(warning);
      }
      renderSensitiveShares(encodeResult, [result.payload], context.writeClipboard, [formatLabel(result.format)]);
      const save = document.createElement('button');
      save.type = 'button';
      save.className = 'secret-action compact secret-copy-action';
      save.textContent = 'Save record';
      save.disabled = true;
      save.addEventListener('click', () => {
        context.downloadText(result.record, mncFileName(result.mode, result.format), 'text/plain');
      });
      const saveNote = document.createElement('p');
      saveNote.className = 'field-note';
      saveNote.textContent =
        'The saved text record includes the mode, representation, and payload. Dates are not saved.';
      encodeResult.append(save, saveNote);
      if (result.format === 'colors' || result.format === 'colors-unicode') {
        appendPalette(encodeResult, result.colors);
      }
    } catch (cause) {
      encodeResult.textContent = cause instanceof Error ? cause.message : 'MnemoCode encoding failed.';
    }
  });

  required<HTMLButtonElement>('#decode-mnemocode').addEventListener('click', () => {
    decodeResult.replaceChildren();
    try {
      const mode = selectedMode('#mnemocode-decode-mode');
      const format = required<HTMLSelectElement>('#mnemocode-decode-format').value as MnemoCodeFormat | 'auto';
      const result = decodeMnemoCode(decodeInput.value, {
        mode,
        format,
        dates: dates('#mnemocode-decode-dates', mode),
      });
      appendMetadata(decodeResult, result.mode, result.format);
      if (result.candidates !== undefined) {
        renderCandidates(decodeResult, result.candidates, context.writeClipboard);
      } else if (result.mnemonic !== undefined && result.checksumValid) {
        renderRecoveredMnemonic(
          decodeResult,
          result.mnemonic,
          context.writeClipboard,
          context.useMnemonicInDeriver,
          context.mnemonicToSeed,
        );
      } else if (result.mnemonic !== undefined) {
        renderInvalidMnemonic(decodeResult, result.mnemonic, context.writeClipboard);
      }
    } catch (cause) {
      decodeResult.textContent = cause instanceof Error ? cause.message : 'MnemoCode decoding failed.';
    }
  });

  const missingWordResult = required<HTMLElement>('#mnemocode-missing-word-result');
  const missingWordInput = required<HTMLTextAreaElement>('#mnemocode-missing-word-input');
  const legacyLastWord = required<HTMLInputElement>('#mnemocode-legacy-last-word');
  const clearMissingWordResult = (): void => missingWordResult.replaceChildren();
  missingWordInput.addEventListener('input', clearMissingWordResult);
  legacyLastWord.addEventListener('change', clearMissingWordResult);
  required<HTMLButtonElement>('#recover-mnemocode-word').addEventListener('click', () => {
    clearMissingWordResult();
    try {
      const candidates = legacyLastWord.checked
        ? recoverMnemoCodeLegacyLastWords(missingWordInput.value)
        : recoverMnemoCodeWord(missingWordInput.value);
      renderMissingWordCandidates(missingWordResult, candidates, context.writeClipboard, legacyLastWord.checked);
    } catch (cause) {
      missingWordResult.textContent = cause instanceof Error ? cause.message : 'Forgotten-word recovery failed.';
    }
  });
}
