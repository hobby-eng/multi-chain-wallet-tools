import type { DerivationResult, DerivedRow, DisplayMode, ResultField } from '@ckd/core/types.js';

export interface ResultsRenderOptions {
  mode: DisplayMode;
  selected: ReadonlySet<number>;
  secretsRevealed: boolean;
  windowStart: number;
  windowSize: number;
  onWindowChange(start: number): void;
  onSelectionChange(index: number, selected: boolean): void;
}

export interface ResultWindow {
  start: number;
  end: number;
  size: number;
}

export function normalizeResultWindow(total: number, requestedStart: number, requestedSize: number): ResultWindow {
  const size = Number.isSafeInteger(requestedSize) && requestedSize > 0 ? requestedSize : 1;
  if (total <= 0) return { start: 0, end: 0, size };
  const lastPageStart = Math.floor((total - 1) / size) * size;
  const start = Math.min(Math.max(0, Math.floor(requestedStart / size) * size), lastPageStart);
  return { start, end: Math.min(total, start + size), size };
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function fieldRow(
  field: ResultField,
  locator: { scope: 'summary' | 'row'; row?: number },
  secretsRevealed: boolean,
): HTMLElement {
  const row = element('div', 'row');
  const label = element('div', 'row-label', field.label);
  if (field.description !== undefined) {
    label.title = field.description;
    label.classList.add('has-description');
  }
  const value = element('div', `value${field.secret ? ' secret-value' : ''}`, field.value);
  const copy = element('button', 'copy', 'COPY');
  copy.type = 'button';
  copy.dataset.copyScope = locator.scope;
  copy.dataset.copyField = field.key;
  if (locator.row !== undefined) copy.dataset.copyRow = String(locator.row);
  copy.dataset.secret = String(field.secret);
  copy.disabled = field.secret && !secretsRevealed;
  copy.title = copy.disabled ? 'Reveal private and privacy-sensitive values before copying.' : `Copy ${field.label}`;
  row.append(label, value, copy);
  return row;
}

function basicFieldCell(field: ResultField | undefined, rowIndex: number, secretsRevealed: boolean): HTMLTableCellElement {
  const cell = element('td', field?.key === 'address' ? 'basic-address-cell' : undefined);
  if (field === undefined) {
    cell.append(element('span', 'table-empty', '—'));
    return cell;
  }
  const content = element('div', 'table-value-wrap');
  const value = element('span', `value${field.secret ? ' secret-value' : ''}`, field.value);
  const copy = element('button', 'copy', 'COPY');
  copy.type = 'button';
  copy.dataset.copyScope = 'row';
  copy.dataset.copyRow = String(rowIndex);
  copy.dataset.copyField = field.key;
  copy.dataset.secret = String(field.secret);
  copy.disabled = field.secret && !secretsRevealed;
  copy.title = copy.disabled ? 'Reveal sensitive values before copying.' : `Copy ${field.label}`;
  content.append(value, copy);
  cell.append(content);
  return cell;
}

function selectionCheckbox(derivedIndex: number, checked: boolean, onChange: (checked: boolean) => void): HTMLInputElement {
  const checkbox = element('input');
  checkbox.type = 'checkbox';
  checkbox.checked = checked;
  checkbox.dataset.selectRow = String(derivedIndex);
  checkbox.setAttribute('aria-label', `Select result ${derivedIndex}`);
  checkbox.addEventListener('change', () => onChange(checkbox.checked));
  return checkbox;
}

function appendBasicRows(
  body: HTMLTableSectionElement,
  rows: readonly DerivedRow[],
  fieldKeys: readonly string[],
  options: ResultsRenderOptions,
): void {
  const fragment = document.createDocumentFragment();
  for (const derived of rows) {
    const row = element('tr');
    const selectionCell = element('td', 'select-column');
    selectionCell.append(selectionCheckbox(derived.index, options.selected.has(derived.index), (checked) => {
      options.onSelectionChange(derived.index, checked);
    }));
    row.append(selectionCell, element('td', 'path-column value', derived.path));
    for (const key of fieldKeys) {
      row.append(basicFieldCell(derived.basic.find((field) => field.key === key), derived.index, options.secretsRevealed));
    }
    fragment.append(row);
  }
  body.append(fragment);
}

function advancedCard(derived: DerivedRow, options: ResultsRenderOptions): HTMLElement {
  const card = element('article', 'address-card');
  const head = element('div', 'card-head');
  const identity = element('div');
  identity.append(
    element('h3', undefined, derived.title),
    element('div', 'card-index', derived.path),
  );
  const selectionLabel = element('label', 'row-selection');
  const checkbox = selectionCheckbox(derived.index, options.selected.has(derived.index), (checked) => {
    options.onSelectionChange(derived.index, checked);
  });
  selectionLabel.append(checkbox, document.createTextNode(' Select this result'));
  const address = derived.basic.find((field) => field.key === 'address');
  const right = element('div', 'card-right');
  if (address !== undefined) right.append(element('div', 'address', address.value));
  right.append(selectionLabel);
  head.append(identity, right);

  const body = element('div', 'address-body');
  for (const field of derived.basic) {
    body.append(fieldRow(field, { scope: 'row', row: derived.index }, options.secretsRevealed));
  }
  if (derived.advanced.length > 0) {
    const detailRows = element('div', 'advanced-field-rows');
    for (const field of derived.advanced) {
      detailRows.append(fieldRow(field, { scope: 'row', row: derived.index }, options.secretsRevealed));
    }
    body.append(detailRows);
  }
  card.append(head, body);
  return card;
}

function resultWindowControls(total: number, window: ResultWindow, options: ResultsRenderOptions): HTMLElement {
  const navigation = element('nav', 'result-window-controls');
  navigation.setAttribute('aria-label', 'Displayed result window');
  const page = total === 0 ? 0 : Math.floor(window.start / window.size) + 1;
  const pages = total === 0 ? 0 : Math.ceil(total / window.size);
  const range = element(
    'span',
    'result-window-range',
    total === 0
      ? 'No generated results'
      : `Showing ${window.start + 1}–${window.end} of ${total.toLocaleString()} · page ${page} of ${pages}`,
  );
  const note = element('small', 'result-window-note', 'Only this visible window is kept in the page DOM.');
  const copy = element('div', 'result-window-copy');
  copy.append(range, note);

  const actions = element('div', 'mini-actions');
  const previous = element('button', 'secondary compact', 'Previous');
  const next = element('button', 'secondary compact', 'Next');
  previous.type = 'button';
  next.type = 'button';
  previous.disabled = window.start === 0;
  next.disabled = window.end >= total;
  previous.addEventListener('click', () => options.onWindowChange(Math.max(0, window.start - window.size)));
  next.addEventListener('click', () => options.onWindowChange(window.start + window.size));
  actions.append(previous, next);
  navigation.append(copy, actions);
  return navigation;
}

export function renderResults(
  summaryRoot: HTMLElement,
  listRoot: HTMLElement,
  noticesRoot: HTMLElement,
  result: DerivationResult,
  options: ResultsRenderOptions,
): void {
  summaryRoot.replaceChildren();
  listRoot.replaceChildren();
  noticesRoot.replaceChildren();

  const accountFields = options.mode === 'advanced'
    ? [...result.basicSummary, ...result.summary]
    : result.basicSummary;
  if (accountFields.length > 0 || (options.mode === 'advanced' && result.summary.length > 0)) {
    const card = element('article', 'key-card summary-card root-material-card');
    card.append(
      element('div', 'root-card-kicker', 'ACCOUNT-SCOPED MATERIAL'),
      element('h3', undefined, 'Account / root details — source of all results below'),
      element('div', 'path', `${result.pathTemplate} · ${result.networkLabel}`),
      element(
        'div',
        'root-warning',
        'Critical: revealing or copying root/account secrets can compromise every address derived from this account, not only one row.',
      ),
    );
    for (const field of accountFields) {
      card.append(fieldRow(field, { scope: 'summary' }, options.secretsRevealed));
    }
    summaryRoot.append(card);
  }

  for (const notice of result.notices) {
    noticesRoot.append(element('div', 'result-help', notice));
  }

  const window = normalizeResultWindow(result.rows.length, options.windowStart, options.windowSize);
  const visibleRows = result.rows.slice(window.start, window.end);
  listRoot.append(resultWindowControls(result.rows.length, window, options));

  if (options.mode === 'basic') {
    const fieldDefinitions = new Map<string, ResultField>();
    for (const field of result.rows[0]?.basic ?? []) fieldDefinitions.set(field.key, field);
    const wrapper = element('div', 'basic-table-wrap');
    const table = element('table', 'basic-results-table');
    const head = element('thead');
    const headerRow = element('tr');
    headerRow.append(element('th', 'select-column', 'Use'), element('th', 'path-column', 'Derivation path / address index'));
    for (const field of fieldDefinitions.values()) {
      const header = element('th', undefined, field.label);
      header.dataset.fieldKey = field.key;
      if (field.description !== undefined) {
        header.title = field.description;
        header.classList.add('has-description');
      }
      headerRow.append(header);
    }
    head.append(headerRow);
    const body = element('tbody');
    appendBasicRows(body, visibleRows, [...fieldDefinitions.keys()], options);
    table.append(head, body);
    wrapper.append(table);
    listRoot.append(wrapper);
    return;
  }

  for (const derived of visibleRows) {
    listRoot.append(advancedCard(derived, options));
  }
}

export function updateSecretVisibility(results: HTMLElement, revealed: boolean): void {
  results.classList.toggle('revealed', revealed);
  for (const button of results.querySelectorAll<HTMLButtonElement>('[data-secret="true"]')) {
    button.disabled = !revealed;
    button.title = revealed
      ? 'Copy this sensitive value.'
      : 'Reveal private and privacy-sensitive values before copying.';
  }
}
