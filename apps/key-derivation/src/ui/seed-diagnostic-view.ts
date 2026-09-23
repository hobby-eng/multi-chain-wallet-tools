import type { MnemonicDiagnostic } from '@ckd/core/bip39.js';

export function renderSeedDiagnostic(
  document: Document,
  seedDiagnostic: HTMLElement,
  diagnostic: MnemonicDiagnostic,
  fingerprint: string | null,
  revealed: boolean,
): void {
  const status = (passed: boolean, success: string, failure: string): HTMLDivElement => {
    const row = document.createElement('div');
    row.className = `seed-diagnostic-check ${passed ? 'passed' : 'failed'}`;
    const icon = document.createElement('span');
    icon.textContent = passed ? '✓' : '×';
    const label = document.createElement('span');
    label.textContent = passed ? success : failure;
    row.append(icon, label);
    return row;
  };
  if (diagnostic.wordCount === 0) {
    const note = document.createElement('p');
    note.className = 'field-note';
    note.textContent = 'Enter an English BIP39 recovery phrase to check its structure.';
    seedDiagnostic.replaceChildren(seedDiagnostic.firstElementChild!, note);
    return;
  }
  const checks = document.createElement('div');
  checks.className = 'seed-diagnostic-checks';
  checks.append(
    status(
      diagnostic.wordCountValid,
      `${diagnostic.wordCount} words`,
      `${diagnostic.wordCount} words · expected 12, 15, 18, 21, or 24`,
    ),
    status(
      diagnostic.allWordsKnown,
      'All words in BIP39 English list',
      'One or more words are not in the BIP39 English list',
    ),
    status(
      diagnostic.checksumValid,
      'Checksum valid',
      diagnostic.allWordsKnown && diagnostic.wordCountValid ? 'Checksum invalid' : 'Checksum cannot be checked yet',
    ),
    status(true, 'NFKD normalized', 'NFKD normalization unavailable'),
  );
  const metrics = document.createElement('dl');
  metrics.className = 'seed-diagnostic-metrics';
  const metric = (labelText: string, valueText: string, conceal = false): void => {
    const term = document.createElement('dt');
    term.textContent = labelText;
    const value = document.createElement('dd');
    value.textContent = conceal && !revealed ? '••••••••' : valueText;
    metrics.append(term, value);
  };
  if (diagnostic.entropyBits !== null && diagnostic.checksumBits !== null) {
    metric('Entropy', `${diagnostic.entropyBits} bits`);
    metric('Checksum', `${diagnostic.checksumBits} bits`);
  }
  if (fingerprint !== null) metric('BIP32 master fingerprint', fingerprint, true);
  const problems = document.createElement('div');
  problems.className = 'seed-diagnostic-problems';
  for (const unknown of diagnostic.unknownWords) {
    const item = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = `Word ${unknown.index + 1}: ${revealed ? `“${unknown.word}”` : '“••••”'}`;
    const explanation = document.createElement('span');
    explanation.textContent = 'Not in the BIP39 English list.';
    item.append(title, explanation);
    if (unknown.suggestions.length > 0) {
      const suggestions = document.createElement('span');
      suggestions.textContent = `Possible words: ${revealed ? unknown.suggestions.join(', ') : 'reveal recovery source to view'}`;
      item.append(suggestions);
    }
    problems.append(item);
  }
  const constructionDetails = document.createElement('details');
  constructionDetails.className = 'seed-construction-details';
  constructionDetails.open =
    seedDiagnostic.querySelector<HTMLDetailsElement>('.seed-construction-details')?.open ?? false;
  const constructionSummary = document.createElement('summary');
  constructionSummary.textContent = 'Mnemonic construction details';
  constructionDetails.append(constructionSummary);
  if (!revealed) {
    const concealedNote = document.createElement('p');
    concealedNote.className = 'field-note';
    concealedNote.textContent = 'Reveal recovery source to view words, indexes, entropy, and checksum bits.';
    constructionDetails.append(concealedNote);
  } else {
    const construction = diagnostic.construction;
    if (construction !== null) {
      const values = document.createElement('dl');
      values.className = 'seed-construction-values';
      const value = (labelText: string, valueText: string): void => {
        const term = document.createElement('dt');
        term.textContent = labelText;
        const description = document.createElement('dd');
        const code = document.createElement('code');
        code.textContent = valueText;
        description.append(code);
        values.append(term, description);
      };
      value('BIP39 entropy · hexadecimal', construction.entropyHex);
      value('BIP39 entropy · binary', construction.entropyBinary);
      value('Checksum · supplied', construction.providedChecksum);
      value('Checksum · expected', construction.expectedChecksum);
      value('Entropy + checksum', construction.mnemonicBinary);
      value('Word indexes · 0–2047', construction.wordIndexes.join(', '));
      constructionDetails.append(values);
    } else {
      const unavailable = document.createElement('p');
      unavailable.className = 'field-note';
      unavailable.textContent = 'A checksum-valid BIP39 phrase is required for entropy and checksum details.';
      constructionDetails.append(unavailable);
    }
    const tableWrap = document.createElement('div');
    tableWrap.className = 'seed-word-table-wrap';
    const table = document.createElement('table');
    table.className = 'seed-word-table';
    const header = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (const labelText of ['#', 'Word', 'BIP39 index', 'Hex index', '11-bit group', 'Bit role']) {
      const heading = document.createElement('th');
      heading.scope = 'col';
      heading.textContent = labelText;
      headerRow.append(heading);
    }
    header.append(headerRow);
    const body = document.createElement('tbody');
    for (const word of diagnostic.words) {
      const row = document.createElement('tr');
      for (const valueText of [
        String(word.position),
        word.word,
        word.wordlistIndex === null ? 'Unknown' : String(word.wordlistIndex),
        word.indexHex ?? '—',
        word.bits ?? '—',
        diagnostic.checksumBits !== null && word.position === diagnostic.wordCount
          ? `${11 - diagnostic.checksumBits} entropy + ${diagnostic.checksumBits} checksum`
          : word.wordlistIndex === null
            ? 'Unknown'
            : '11 entropy bits',
      ]) {
        const cell = document.createElement('td');
        cell.textContent = valueText;
        row.append(cell);
      }
      body.append(row);
    }
    table.append(header, body);
    tableWrap.append(table);
    constructionDetails.append(tableWrap);
  }
  seedDiagnostic.replaceChildren(seedDiagnostic.firstElementChild!, checks, metrics, problems, constructionDetails);
}
