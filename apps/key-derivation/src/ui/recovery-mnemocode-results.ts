// What the MnemoCode panel shows: records, palettes, recovered phrases and candidate lists. Plain
// functions, since each only turns a result into elements.
import {
  MNEMOCODE_VERSION,
  type MnemoCodeFormat,
  type MnemoCodeMissingWordCandidate,
  type MnemoCodeMode,
} from "@ckd/recovery-backup/mnemocode.js";
import {
  Masking,
  PHRASE_WORDS,
} from "../../../../packages/recovery-mnemocode/source/core/masking.js";
import { paragraph, renderRecoveredSecret } from "./recovery-workspace-shared.js";

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
  readonly current?: () => boolean;
}

/** A read-only text that stays concealed until it is revealed; it can be copied only while revealed. */
function concealedText({
  value,
  rows,
  subject,
  copyLabel,
  extraClass,
  copy,
  current,
}: ConcealedText): HTMLElement[] {
  // Keep MnemoCode's presentation while the shared owner handles reveal, Copy and concealment.
  const container = document.createElement("div");
  renderRecoveredSecret(
    container,
    value,
    {
      reveal: `Show ${subject}`,
      hide: `Hide ${subject}`,
      copy: `${copyLabel} ${subject}`,
      copyText: copyLabel,
    },
    copy,
    undefined,
    undefined,
    undefined,
    current,
  );
  const output = container.querySelector<HTMLTextAreaElement>("textarea")!;
  output.rows = rows;
  if (extraClass !== undefined) output.classList.add(extraClass);
  return [...container.children] as HTMLElement[];
}

/** A warning box above a recovered result; its text says why the result needs care. */
function warningCallout(text = ""): HTMLDivElement {
  const warning = document.createElement("div");
  warning.className = "warning-callout";
  warning.textContent = text;
  return warning;
}

export function renderInvalidMnemonic(
  container: HTMLElement,
  mnemonic: string,
  copy: (value: string) => Promise<void>,
  current: () => boolean = () => true,
): void {
  const warning = warningCallout(
    "The recovered legacy phrase has an invalid BIP39 checksum. Check the dates and input before using it.",
  );
  container.append(
    warning,
    ...concealedText({
      value: mnemonic,
      rows: 4,
      subject: "phrase",
      copyLabel: "Copy",
      copy,
      current,
    }),
  );
}

/**
 * Where the checksum failed, the shorter phrases that the first codes give with a valid checksum,
 * each by its fingerprint and never by its words, as MnemoCode's decode lists them: codes typed
 * from printed cards end with decoys, which the word count leaves out.
 */
export function renderShorterPhrases(
  container: HTMLElement,
  shorter: readonly { readonly words: number; readonly fingerprint: string }[],
): void {
  if (shorter.length === 0) return;
  const listed = shorter
    .map(({ words, fingerprint }) => `${words} words, fingerprint ${fingerprint}`)
    .join("; ");
  container.append(
    warningCallout(
      `The first codes give a phrase with a valid checksum: ${listed}. Printed cards end with ` +
        `codes that belong to nothing; choose how many words the seed phrase has (${shorter[0]!.words}).`,
    ),
  );
}

/**
 * Every phrase that a record with a replaced last word may hold, each with its fingerprint, as
 * MnemoCode's decode lists them: the phrases concealed, the fingerprints open, since they do not
 * reveal a phrase, with a field that finds the candidate of the wallet's fingerprint.
 */
export function renderLegacyCandidates(
  container: HTMLElement,
  candidates: readonly string[],
  fingerprints: readonly string[],
  copy: (value: string) => Promise<void>,
  current: () => boolean = () => true,
): void {
  const warning = warningCallout(
    `${candidates.length} checksum-valid candidates were recovered. ` +
      "A legacy checksum-word replacement discarded information; use independent wallet evidence to identify the original.",
  );
  const list = document.createElement("p");
  list.className = "field-note mnemocode-candidate-fingerprints";
  list.textContent = `Fingerprints (empty BIP39 passphrase): ${fingerprints
    .map((fingerprint, index) => `${index + 1} ${fingerprint}`)
    .join(" · ")}`;
  const label = document.createElement("label");
  label.textContent = "Your wallet's fingerprint, to find its candidate";
  const lookup = document.createElement("input");
  lookup.type = "text";
  lookup.autocomplete = "off";
  lookup.placeholder = "73c5da0a";
  label.append(lookup);
  const found = document.createElement("p");
  found.className = "field-note";
  found.setAttribute("role", "status");
  lookup.addEventListener("input", () => {
    const wanted = lookup.value.trim().toLowerCase();
    const matches = fingerprints.flatMap((fingerprint, index) =>
      fingerprint === wanted ? [index + 1] : [],
    );
    found.textContent =
      wanted === ""
        ? ""
        : matches.length === 0
          ? "No candidate has this fingerprint."
          : `Candidate ${matches.join(", ")} has this fingerprint.`;
  });
  container.append(
    warning,
    ...concealedText({
      value: candidates
        .map((candidate, index) => `${index + 1}\t${candidate}\t${fingerprints[index]}`)
        .join("\n"),
      rows: Math.min(12, Math.max(5, candidates.length)),
      subject: "candidates",
      copyLabel: "Copy all",
      copy,
      current,
    }),
    list,
    label,
    found,
  );
}

/**
 * Codes marked with ? that the search found, as MnemoCode's decode reports them: which codes were
 * filled in, the codes whole (concealed, since codes without Seedshift are the phrase), the dates
 * found, and the advice to correct the written copy.
 */
export function renderFoundCodes(
  container: HTMLElement,
  found: { readonly places: string; readonly codes: string; readonly foundDates?: string },
  correct: string,
  copy: (value: string) => Promise<void>,
  current: () => boolean = () => true,
): void {
  container.append(
    paragraph(`${found.places} found:`, "field-note"),
    ...concealedText({
      value: found.codes,
      rows: 3,
      subject: "codes",
      copyLabel: "Copy",
      copy,
      current,
    }),
    ...(found.foundDates === undefined
      ? []
      : [paragraph(`Dates found: ${found.foundDates}`, "field-note")]),
    paragraph(correct, "field-note"),
  );
}

/** Every candidate of codes marked with ?, one per line as MnemoCode prints them, concealed. */
export function renderMissingCodesList(
  container: HTMLElement,
  rows: readonly {
    readonly codes: string;
    readonly phrase: string;
    readonly fingerprint: string;
  }[],
  explanation: string,
  copy: (value: string) => Promise<void>,
  current: () => boolean = () => true,
): void {
  container.append(
    paragraph(`${rows.length} candidate${rows.length === 1 ? "" : "s"}.`, "field-note"),
    ...concealedText({
      value: rows
        .map(
          ({ codes, phrase, fingerprint }, index) =>
            `${index + 1}\t${codes}\t${phrase}\t${fingerprint}`,
        )
        .join("\n"),
      rows: Math.min(12, Math.max(4, rows.length)),
      subject: "candidates",
      copyLabel: "Copy all",
      copy,
      current,
    }),
    paragraph(explanation, "field-note"),
  );
}

export function renderMissingWordCandidates(
  container: HTMLElement,
  candidates: readonly MnemoCodeMissingWordCandidate[],
  copy: (value: string) => Promise<void>,
  legacyReplacement = false,
  current: () => boolean = () => true,
): void {
  const summary = warningCallout();
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
      current,
    }),
  );
}

/**
 * Under a new record: the fingerprints of the phrase and of its encoded words, in MnemoCode's words
 * (PHRASE_WORDS). The encoded one lets Decode catch a miscopied code before anything else is
 * computed; with Seedshift it is that of the masked phrase (decoy), which no wallet check matches.
 */
export function appendEncodeFingerprints(
  container: HTMLElement,
  mode: MnemoCodeMode,
  original: string,
  encoded: string | undefined,
): void {
  const masking = Masking.of(mode);
  const text =
    encoded === undefined
      ? `${PHRASE_WORDS.originalFingerprint} ${original}. The encoded words fail the BIP39 checksum, so they have no ` +
        "fingerprint. It is a BIP32 master key fingerprint for an empty BIP39 passphrase and does not " +
        "reveal the phrase."
      : `${PHRASE_WORDS.originalFingerprint} ${original} · ${masking.encodedFingerprintLabel} ${encoded}.` +
        (masking.masked ? ` ${PHRASE_WORDS.fingerprintRoles}` : "") +
        " Both are BIP32 master key fingerprints for an empty BIP39 passphrase and do not reveal the phrase. " +
        "Note the encoded one with the record: Decode shows the fingerprint of the codes you type, so a " +
        "miscopied code is caught at once.";
  container.append(paragraph(text, "field-note"));
}

/** The fingerprint of a recovered phrase, shown without the phrase so that it can be compared at once. */
export function appendRecoveredFingerprint(container: HTMLElement, fingerprint: string): void {
  container.append(
    paragraph(
      `Phrase: ${PHRASE_WORDS.original}. ${PHRASE_WORDS.originalFingerprint} ${fingerprint} (BIP32 ` +
        "master key fingerprint for an empty BIP39 passphrase). Compare it with your wallet's.",
      "field-note",
    ),
  );
}
