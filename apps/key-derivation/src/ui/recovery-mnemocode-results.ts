// What the MnemoCode panel shows: records, palettes, recovered phrases and candidate lists. Plain
// functions, since each only turns a result into elements.
import {
  MNEMOCODE_VERSION,
  type MnemoCodeFormat,
  type MnemoCodeMissingWordCandidate,
  type MnemoCodeMode,
} from "@ckd/recovery-backup/mnemocode.js";
import { paragraph } from "./recovery-workspace-shared.js";

export function appendMetadata(
  container: HTMLElement,
  mode: MnemoCodeMode,
  format: MnemoCodeFormat,
): void {
  const metadata = document.createElement("p");
  metadata.className = "field-note";
  metadata.textContent = `MnemoCode ${MNEMOCODE_VERSION} · mode ${mode} · ${formatLabel(format)}. Dates are not stored in the record.`;
  container.append(metadata);
}

export function formatLabel(format: MnemoCodeFormat): string {
  switch (format) {
    case "english":
      return "English BIP39 words";
    case "indexes":
      return "BIP39 word numbers (1–2048)";
    case "unicode":
      return "mapped Unicode code points";
    case "colors":
      return "#RRGGBB colors";
    case "colors-unicode":
      return "color Unicode code points";
  }
}

export function mncFileName(mode: MnemoCodeMode, format: MnemoCodeFormat): string {
  return `mnemocode-${MNEMOCODE_VERSION}-${mode}-${format}.mnc`;
}

export function appendPalette(container: HTMLElement, colors: readonly string[]): void {
  const palette = document.createElement("div");
  palette.className = "mnemocode-palette concealed share-secret";
  palette.setAttribute("aria-label", "Exact MnemoCode color references");
  for (const color of colors) {
    const swatch = document.createElement("div");
    swatch.className = "mnemocode-swatch";
    swatch.style.setProperty("--mnemocode-color", color);
    const reference = document.createElement("code");
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
function concealedText({
  value,
  rows,
  subject,
  copyLabel,
  extraClass,
  copy,
}: ConcealedText): HTMLElement[] {
  const output = document.createElement("textarea");
  output.rows = rows;
  output.readOnly = true;
  output.className = extraClass === undefined ? "concealed" : `concealed ${extraClass}`;
  output.value = value;
  const reveal = document.createElement("button");
  reveal.type = "button";
  reveal.className = "danger-outline compact";
  reveal.textContent = `Show ${subject}`;
  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "secret-action compact";
  copyButton.textContent = copyLabel;
  copyButton.setAttribute("aria-label", `${copyLabel} ${subject}`);
  copyButton.disabled = true;
  reveal.addEventListener("click", () => {
    const visible = output.classList.contains("concealed");
    output.classList.toggle("concealed", !visible);
    reveal.textContent = visible ? `Hide ${subject}` : `Show ${subject}`;
    reveal.setAttribute("aria-pressed", String(visible));
    copyButton.disabled = !visible;
  });
  copyButton.addEventListener("click", () => void copy(value));
  const actions = document.createElement("div");
  actions.className = "actions";
  actions.append(reveal, copyButton);
  return [output, actions];
}

export function renderInvalidMnemonic(
  container: HTMLElement,
  mnemonic: string,
  copy: (value: string) => Promise<void>,
): void {
  const warning = document.createElement("div");
  warning.className = "warning-callout";
  warning.textContent =
    "The recovered legacy phrase has an invalid BIP39 checksum. Check the dates and input before using it.";
  container.append(
    warning,
    ...concealedText({
      value: mnemonic,
      rows: 4,
      subject: "phrase",
      copyLabel: "Copy",
      copy,
    }),
  );
}

export function renderCandidates(
  container: HTMLElement,
  candidates: readonly string[],
  copy: (value: string) => Promise<void>,
): void {
  const warning = document.createElement("div");
  warning.className = "warning-callout";
  warning.textContent =
    `${candidates.length} checksum-valid candidates were recovered. ` +
    "A legacy checksum-word replacement discarded information; use independent wallet evidence to identify the original.";
  container.append(
    warning,
    ...concealedText({
      value: candidates.map((candidate, index) => `${index + 1}\t${candidate}`).join("\n"),
      rows: Math.min(12, Math.max(5, candidates.length)),
      subject: "candidates",
      copyLabel: "Copy all",
      copy,
    }),
  );
}

export function renderMissingWordCandidates(
  container: HTMLElement,
  candidates: readonly MnemoCodeMissingWordCandidate[],
  copy: (value: string) => Promise<void>,
  legacyReplacement = false,
): void {
  const summary = document.createElement("div");
  summary.className = "warning-callout";
  if (candidates.length === 0) {
    summary.textContent =
      "No checksum-valid BIP39 phrase matches the supplied known words. Check the other words, their order, and the placeholder position.";
    container.append(summary);
    return;
  }
  summary.textContent = legacyReplacement
    ? `${candidates.length} checksum-valid final-word replacements were found. The row marked preserved retains the entropy-bearing bits of the supplied old final word. These are replacement containers, not proof of the original wallet.`
    : `${candidates.length} checksum-valid replacements were found for word ${candidates[0]!.position}. A valid checksum does not identify the intended wallet; verify it with independent public wallet evidence.`;
  const options = document.createElement("textarea");
  options.rows = Math.min(14, Math.max(5, candidates.length));
  options.readOnly = true;
  options.className = "mnemocode-word-options";
  options.setAttribute("aria-label", "Checksum-valid BIP39 word replacements");
  options.value = [
    `candidate\tword\tword-index\tchecksum-bits${legacyReplacement ? "\tlegacy-tail" : ""}`,
    ...candidates.map(
      (candidate, index) =>
        `${index + 1}\t${candidate.word}\t${candidate.wordIndex}\t${candidate.checksumBits}${
          legacyReplacement
            ? `\t${candidate.preservesLegacyEntropy ? "preserved" : "alternative"}`
            : ""
        }`,
    ),
  ].join("\n");
  container.append(
    summary,
    options,
    ...concealedText({
      value: [
        `candidate\tword\tword-index\tchecksum-bits${legacyReplacement ? "\tlegacy-tail" : ""}\tmnemonic`,
        ...candidates.map(
          (candidate, index) =>
            `${index + 1}\t${candidate.word}\t${candidate.wordIndex}\t${candidate.checksumBits}${
              legacyReplacement
                ? `\t${candidate.preservesLegacyEntropy ? "preserved" : "alternative"}`
                : ""
            }\t${candidate.mnemonic}`,
        ),
      ].join("\n"),
      rows: Math.min(14, Math.max(5, candidates.length)),
      subject: "phrases",
      copyLabel: "Copy all",
      extraClass: "mnemocode-word-phrases",
      copy,
    }),
  );
}

/**
 * Under a new record: the fingerprints of the phrase and of its encoded words. The encoded one lets
 * Decode catch a miscopied code before anything else is computed.
 */
export function appendEncodeFingerprints(
  container: HTMLElement,
  original: string,
  encoded: string | undefined,
): void {
  const text =
    encoded === undefined
      ? `Original fingerprint ${original}. The encoded words fail the BIP39 checksum, so they have no ` +
        "fingerprint. It is a BIP32 master key fingerprint for an empty BIP39 passphrase and does not " +
        "reveal the phrase."
      : `Original fingerprint ${original} · encoded fingerprint ${encoded}. Both are BIP32 master key ` +
        "fingerprints for an empty BIP39 passphrase and do not reveal the phrase. Note the encoded one with " +
        "the record: Decode shows the fingerprint of the codes you type, so a miscopied code is caught at once.";
  container.append(paragraph(text, "field-note"));
}

/** The fingerprint of a recovered phrase, shown without the phrase so that it can be compared at once. */
export function appendRecoveredFingerprint(container: HTMLElement, fingerprint: string): void {
  container.append(
    paragraph(
      `Recovered fingerprint ${fingerprint} (BIP32 master key fingerprint for an empty BIP39 passphrase). ` +
        "Compare it with your wallet's.",
      "field-note",
    ),
  );
}
