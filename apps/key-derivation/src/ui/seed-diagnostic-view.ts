import type { MnemonicDiagnostic } from "@ckd/core/bip39.js";
import { BIP39_WORD_BITS, BIP39_WORD_COUNT_LIST } from "@ckd/core/bip39-parameters.js";
import { RenderedSecrets } from "./secrets.js";

/** One native render operation accepts a diagnostic or an input-free unavailable state. */
export type SeedDiagnosticPresentation = MnemonicDiagnostic | { readonly unavailable: string };

/** Native diagnostic presentation; every replaced private node loses its text before detachment. */
export class SeedDiagnosticView {
  static #text(document: Document, tag: string, text: string, secret = false): HTMLElement {
    const element = document.createElement(tag);
    if (secret) {
      element.classList.add("secret-value");
      new RenderedSecrets(element, text, true);
    } else element.textContent = text;
    return element;
  }

  static #retire(document: Document, root: HTMLElement): void {
    const heading = root.firstElementChild ?? this.#text(document, "h3", "Seed Diagnostic");
    RenderedSecrets.clear(root);
    root.append(heading);
  }

  /** Clear previous private nodes before presenting a refusal, empty state or pending self-test. */
  static unavailable(document: Document, root: HTMLElement, message: string): void {
    this.#retire(document, root);
    const note = this.#text(document, "p", message);
    note.className = "field-note";
    root.append(note);
  }

  /** Revoke private presentations while retaining the panel's non-secret heading. */
  static clear(root: HTMLElement): void {
    this.#retire(root.ownerDocument, root);
  }

  static #status(
    document: Document,
    passed: boolean,
    success: string,
    failure: string,
  ): HTMLElement {
    const row = document.createElement("div");
    row.className = `seed-diagnostic-check ${passed ? "passed" : "failed"}`;
    row.append(
      this.#text(document, "span", passed ? "✓" : "×"),
      this.#text(document, "span", passed ? success : failure),
    );
    return row;
  }

  static #checks(document: Document, diagnostic: MnemonicDiagnostic): HTMLElement {
    const checks = document.createElement("div");
    checks.className = "seed-diagnostic-checks";
    checks.append(
      this.#status(
        document,
        diagnostic.wordCountValid,
        `${diagnostic.wordCount} words`,
        `${diagnostic.wordCount} words · expected ${BIP39_WORD_COUNT_LIST}`,
      ),
      this.#status(
        document,
        diagnostic.allWordsKnown,
        "All words in BIP39 English list",
        "One or more words are not in the BIP39 English list",
      ),
      this.#status(
        document,
        diagnostic.checksumValid,
        "Checksum valid",
        diagnostic.allWordsKnown && diagnostic.wordCountValid
          ? "Checksum invalid"
          : "Checksum cannot be checked yet",
      ),
      this.#status(document, true, "NFKD normalized", "NFKD normalization unavailable"),
    );
    return checks;
  }

  static #metric(
    document: Document,
    root: HTMLElement,
    label: string,
    value: string,
    secret = false,
  ): void {
    root.append(this.#text(document, "dt", label), this.#text(document, "dd", value, secret));
  }

  static #metrics(
    document: Document,
    diagnostic: MnemonicDiagnostic,
    fingerprint: string | null,
    revealed: boolean,
  ): HTMLElement {
    const metrics = document.createElement("dl");
    metrics.className = "seed-diagnostic-metrics";
    if (diagnostic.entropyBits !== null && diagnostic.checksumBits !== null) {
      this.#metric(document, metrics, "Entropy", `${diagnostic.entropyBits} bits`);
      this.#metric(document, metrics, "Checksum", `${diagnostic.checksumBits} bits`);
    }
    if (fingerprint !== null && revealed)
      this.#metric(document, metrics, "BIP32 master fingerprint", fingerprint, true);
    return metrics;
  }

  static #problems(
    document: Document,
    diagnostic: MnemonicDiagnostic,
    revealed: boolean,
  ): HTMLElement {
    const problems = document.createElement("div");
    problems.className = "seed-diagnostic-problems";
    for (const unknown of diagnostic.unknownWords) {
      const item = document.createElement("div");
      item.append(
        this.#text(
          document,
          "strong",
          `Word ${unknown.index + 1}: ${revealed ? `“${unknown.word}”` : "“••••”"}`,
          revealed,
        ),
        this.#text(document, "span", "Not in the BIP39 English list."),
      );
      if (revealed) {
        const suggestions = unknown.suggestions;
        if (suggestions.length > 0)
          item.append(
            this.#text(document, "span", `Possible words: ${suggestions.join(", ")}`, true),
          );
      } else
        item.append(this.#text(document, "span", "Show the phrase to view spelling suggestions."));
      problems.append(item);
    }
    return problems;
  }

  static #constructionValues(document: Document, diagnostic: MnemonicDiagnostic): HTMLElement {
    const values = document.createElement("dl");
    values.className = "seed-construction-values";
    const construction = diagnostic.construction;
    if (construction === null) {
      const unavailable = this.#text(
        document,
        "p",
        "A checksum-valid BIP39 phrase is required for entropy and checksum details.",
      );
      unavailable.className = "field-note";
      return unavailable;
    }
    const entries = [
      ["BIP39 entropy · hexadecimal", construction.entropyHex],
      ["BIP39 entropy · binary", construction.entropyBinary],
      ["Checksum · supplied", construction.providedChecksum],
      ["Checksum · expected", construction.expectedChecksum],
      ["Entropy + checksum", construction.mnemonicBinary],
      [`Word indexes · 0–${2 ** BIP39_WORD_BITS - 1}`, construction.wordIndexes.join(", ")],
    ] as const;
    for (const [label, text] of entries) {
      const description = document.createElement("dd");
      description.append(this.#text(document, "code", text, true));
      values.append(this.#text(document, "dt", label), description);
    }
    return values;
  }

  static #table(document: Document, diagnostic: MnemonicDiagnostic): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "seed-word-table-wrap";
    const table = document.createElement("table");
    table.className = "seed-word-table";
    const header = document.createElement("thead");
    const headerRow = document.createElement("tr");
    for (const label of [
      "#",
      "Word",
      "BIP39 index",
      "Hex index",
      `${BIP39_WORD_BITS}-bit group`,
      "Bit role",
    ]) {
      const heading = this.#text(document, "th", label);
      heading.setAttribute("scope", "col");
      headerRow.append(heading);
    }
    header.append(headerRow);
    const body = document.createElement("tbody");
    for (const word of diagnostic.words) {
      const row = document.createElement("tr");
      row.append(this.#text(document, "td", String(word.position)));
      const role =
        diagnostic.checksumBits !== null && word.position === diagnostic.wordCount
          ? `${BIP39_WORD_BITS - diagnostic.checksumBits} entropy + ${diagnostic.checksumBits} checksum`
          : word.wordlistIndex === null
            ? "Unknown"
            : `${BIP39_WORD_BITS} entropy bits`;
      for (const value of [
        word.word,
        word.wordlistIndex === null ? "Unknown" : String(word.wordlistIndex),
        word.indexHex ?? "—",
        word.bits ?? "—",
        role,
      ])
        row.append(this.#text(document, "td", value, true));
      body.append(row);
    }
    table.append(header, body);
    wrap.append(table);
    return wrap;
  }

  /** Render only admitted disclosure; hidden diagnostics never copy words or entropy into nodes. */
  static render(
    document: Document,
    root: HTMLElement,
    diagnostic: SeedDiagnosticPresentation,
    fingerprint: string | null,
    revealed: boolean,
  ): void {
    // Its values are drawn only while the phrase is shown, and then unblurred (owner, 2026-10-23).
    root.classList.toggle("diagnostic-revealed", revealed);
    if ("unavailable" in diagnostic) {
      this.unavailable(document, root, diagnostic.unavailable);
      return;
    }
    const open =
      root.querySelector<HTMLDetailsElement>(".seed-construction-details")?.open ?? false;
    this.#retire(document, root);
    if (diagnostic.wordCount === 0) {
      this.unavailable(
        document,
        root,
        "Enter an English BIP39 recovery phrase to check its structure.",
      );
      return;
    }
    const details = document.createElement("details");
    details.className = "seed-construction-details";
    details.open = open;
    details.append(this.#text(document, "summary", "Mnemonic construction details"));
    if (revealed)
      details.append(
        this.#constructionValues(document, diagnostic),
        this.#table(document, diagnostic),
      );
    else {
      const note = this.#text(
        document,
        "p",
        "Show the phrase to view words, indexes, entropy, and checksum bits.",
      );
      note.className = "field-note";
      details.append(note);
    }
    root.append(
      this.#checks(document, diagnostic),
      this.#metrics(document, diagnostic, fingerprint, revealed),
      this.#problems(document, diagnostic, revealed),
      details,
    );
  }
}

/** Compatibility entry for existing recovery and Deriver hosts. */
export const renderSeedDiagnostic = SeedDiagnosticView.render.bind(SeedDiagnosticView);
