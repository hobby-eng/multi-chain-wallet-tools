import {
  fieldColumns,
  isSigningAddressField,
  type DerivationResult,
  type DerivedRow,
  type DisplayMode,
  type ResultField,
} from "@ckd/core/types.js";
import { createPaymentQrAction, paymentQrPayload } from "@ckd/ui/payment-qr.js";
import { ResultWindow } from "@ckd/ui/result-window.js";
import { RenderedSecrets } from "./secrets.js";

/** Display facts and owner-bound callbacks borrowed for one rendered result. */
export interface ResultsRenderOptions {
  mode: DisplayMode;
  selected: ReadonlySet<number>;
  secretsRevealed: boolean;
  windowStart: number;
  windowSize: number;
  onWindowChange(start: number): void;
  onSelectionChange(index: number, selected: boolean): void;
  /** Whether the address field `addressKey` of the result's rows has a signing action. */
  canSignMessage(addressKey: string): boolean;
  onSignMessage(index: number, address: string, addressKey: string): void;
  encryptedBip38: ReadonlyMap<number, string>;
  rowLimit?: number;
}

/** Renders result fields, paging and disclosure controls through one composition entry. */
export class ResultRendering {
  static #element<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string,
  ): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className !== undefined) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  static #iconButton(label: string, pathData: string): HTMLButtonElement {
    const button = ResultRendering.#element("button", "copy icon-action");
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.dataset.iconButton = "true";
    const namespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(namespace, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(namespace, "path");
    path.setAttribute("d", pathData);
    svg.append(path);
    button.append(svg);
    return button;
  }

  static #valueElement<K extends "span" | "div">(
    tag: K,
    field: ResultField,
    revealed: boolean,
  ): HTMLElementTagNameMap[K] {
    const element = ResultRendering.#element(tag, `value${field.secret ? " secret-value" : ""}`);
    if (field.secret) new RenderedSecrets(element, field.value, revealed);
    else element.textContent = field.value;
    return element;
  }

  static #copyButton(
    field: ResultField,
    locator: { scope: "summary" | "row"; row?: number },
    secretsRevealed: boolean,
  ): HTMLButtonElement {
    const copy = ResultRendering.#iconButton(
      `Copy ${field.label}`,
      "M8 7V3h13v13h-4v5H3V7h5zm2 0h7v7h2V5h-9v2zm5 2H5v10h10V9z",
    );
    copy.dataset.copyScope = locator.scope;
    copy.dataset.copyField = field.key;
    if (locator.row !== undefined) copy.dataset.copyRow = String(locator.row);
    copy.dataset.secret = String(field.secret);
    copy.disabled = field.secret && !secretsRevealed;
    copy.title = copy.disabled
      ? "Show private and privacy-sensitive values before copying."
      : `Copy ${field.label}`;
    return copy;
  }

  static #signButton(
    index: number,
    field: ResultField,
    onSign: ResultsRenderOptions["onSignMessage"],
  ): HTMLButtonElement {
    const address = field.value;
    const sign = ResultRendering.#iconButton(
      "Sign or verify a message with this address",
      "M4 20h4l11-11-4-4L4 16v4zm12-16 4 4 1-1a1.4 1.4 0 0 0 0-2l-2-2a1.4 1.4 0 0 0-2 0l-1 1z",
    );
    sign.dataset.signMessage = String(index);
    sign.dataset.signAddress = address;
    sign.addEventListener("click", () => onSign(index, address, field.key));
    return sign;
  }

  static #fieldRow(
    field: ResultField,
    locator: { scope: "summary" | "row"; row?: number },
    options: ResultsRenderOptions,
  ): HTMLElement {
    const row = ResultRendering.#element("div", "row");
    const label = ResultRendering.#element("div", "row-label", field.label);
    if (field.description !== undefined) {
      label.title = field.description;
      label.classList.add("has-description");
    }
    const value = ResultRendering.#valueElement("div", field, options.secretsRevealed);
    const copy = ResultRendering.#copyButton(field, locator, options.secretsRevealed);
    const actions = ResultRendering.#element("div", "field-actions");
    actions.append(copy);
    const qrPayload = paymentQrPayload(field);
    if (qrPayload !== undefined)
      actions.append(createPaymentQrAction(document, qrPayload, field.label));
    if (
      locator.row !== undefined &&
      isSigningAddressField(field) &&
      options.canSignMessage(field.key)
    ) {
      actions.append(
        ResultRendering.#signButton(locator.row, field, options.onSignMessage.bind(options)),
      );
    }
    row.append(label, value, actions);
    return row;
  }

  static #basicFieldCell(
    field: ResultField | undefined,
    rowIndex: number,
    options: ResultsRenderOptions,
  ): HTMLTableCellElement {
    const highlight = field?.key === "address" || field?.key.endsWith("PublicKeyHash") === true;
    const cell = ResultRendering.#element("td", highlight ? "basic-address-cell" : undefined);
    if (field === undefined) {
      cell.append(ResultRendering.#element("span", "table-empty", "—"));
      return cell;
    }
    const content = ResultRendering.#element("div", "table-value-wrap");
    const value = ResultRendering.#valueElement("span", field, options.secretsRevealed);
    const copy = ResultRendering.#copyButton(
      field,
      { scope: "row", row: rowIndex },
      options.secretsRevealed,
    );
    content.append(value, copy);
    const qrPayload = paymentQrPayload(field);
    if (qrPayload !== undefined)
      content.append(createPaymentQrAction(document, qrPayload, field.label));
    if (isSigningAddressField(field) && options.canSignMessage(field.key)) {
      content.append(
        ResultRendering.#signButton(rowIndex, field, options.onSignMessage.bind(options)),
      );
    }
    cell.append(content);
    return cell;
  }

  static #selectionCheckbox(
    derivedIndex: number,
    checked: boolean,
    onChange: (checked: boolean) => void,
    label = `Select result ${derivedIndex}`,
  ): HTMLInputElement {
    const checkbox = ResultRendering.#element("input");
    checkbox.type = "checkbox";
    checkbox.checked = checked;
    checkbox.dataset.selectRow = String(derivedIndex);
    checkbox.setAttribute("aria-label", label);
    checkbox.addEventListener("change", () => onChange(checkbox.checked));
    return checkbox;
  }

  /** The cells of a row's fields under the table's columns, with the BIP38 one beside an address. */
  static #appendFieldCells(
    row: HTMLTableRowElement,
    derived: DerivedRow,
    fieldKeys: readonly string[],
    options: ResultsRenderOptions,
  ): void {
    for (const key of fieldKeys) {
      row.append(
        ResultRendering.#basicFieldCell(
          derived.basic.find((field) => field.key === key),
          derived.index,
          options,
        ),
      );
      if (key === "address" && options.encryptedBip38.size > 0) {
        const encryptedKey = options.encryptedBip38.get(derived.index);
        row.append(
          ResultRendering.#basicFieldCell(
            encryptedKey === undefined
              ? undefined
              : {
                  key: "bip38EncryptedKey",
                  label: "Encrypted private key · BIP38",
                  value: encryptedKey,
                  secret: true,
                },
            derived.index,
            options,
          ),
        );
      }
    }
  }

  /** The cell of a row's note, across the field columns and the BIP38 one beside an address. */
  static #noteCell(
    note: string,
    fieldKeys: readonly string[],
    options: ResultsRenderOptions,
  ): HTMLTableCellElement {
    const cell = ResultRendering.#element("td", "row-note");
    const bip38 = fieldKeys.includes("address") && options.encryptedBip38.size > 0 ? 1 : 0;
    cell.colSpan = Math.max(1, fieldKeys.length + bip38);
    cell.append(ResultRendering.#element("span", "table-empty", note));
    return cell;
  }

  static #appendBasicRows(
    body: HTMLTableSectionElement,
    rows: readonly DerivedRow[],
    fieldKeys: readonly string[],
    options: ResultsRenderOptions,
  ): void {
    const fragment = document.createDocumentFragment();
    for (const derived of rows) {
      const row = ResultRendering.#element("tr");
      const selectionCell = ResultRendering.#element("td", "select-column");
      selectionCell.append(
        ResultRendering.#selectionCheckbox(
          derived.index,
          options.selected.has(derived.index),
          (checked) => {
            options.onSelectionChange(derived.index, checked);
          },
        ),
      );
      const pathCell = ResultRendering.#element("td", "path-column value", derived.path);
      pathCell.title = derived.path;
      pathCell.setAttribute("aria-label", `Derivation path ${derived.path}`);
      row.append(selectionCell, pathCell);
      if (derived.note === undefined)
        ResultRendering.#appendFieldCells(row, derived, fieldKeys, options);
      else row.append(ResultRendering.#noteCell(derived.note, fieldKeys, options));
      fragment.append(row);
    }
    body.append(fragment);
  }

  static #cardHead(derived: DerivedRow): { head: HTMLDivElement; identity: HTMLDivElement } {
    const head = ResultRendering.#element("div", "card-head");
    const identity = ResultRendering.#element("div");
    identity.append(
      ResultRendering.#element("h3", undefined, derived.title),
      ResultRendering.#element("div", "card-index", derived.path),
    );
    return { head, identity };
  }

  static #groupedBasicCard(derived: DerivedRow, options: ResultsRenderOptions): HTMLElement {
    const card = ResultRendering.#element("article", "address-card grouped-result-card");
    const { head, identity } = ResultRendering.#cardHead(derived);
    const right = ResultRendering.#element("div", "card-right");
    right.append(
      ResultRendering.#element(
        "div",
        "identity-profile-badge",
        `${derived.groups?.length ?? 0}-key standard profile`,
      ),
    );
    const selectionLabel = ResultRendering.#element("label", "row-selection");
    const checkbox = ResultRendering.#selectionCheckbox(
      derived.index,
      options.selected.has(derived.index),
      (checked) => options.onSelectionChange(derived.index, checked),
      `Select ${derived.title} and all of its key slots`,
    );
    selectionLabel.append(checkbox, document.createTextNode(" Select this Identity candidate"));
    right.append(selectionLabel);
    head.append(identity, right);

    const body = ResultRendering.#element("div", "grouped-basic-body");
    for (const field of derived.basic) {
      body.append(ResultRendering.#fieldRow(field, { scope: "row", row: derived.index }, options));
    }

    const groups = derived.groups ?? [];
    if (groups.length > 0) {
      const wrapper = ResultRendering.#element("div", "identity-key-table-wrap");
      const table = ResultRendering.#element("table", "identity-key-table");
      const tableHead = ResultRendering.#element("thead");
      const headerRow = ResultRendering.#element("tr");
      headerRow.append(
        ResultRendering.#element(
          "th",
          "identity-key-role-column",
          "Key slot · official default role",
        ),
      );
      for (const field of groups[0]?.basic ?? []) {
        const header = ResultRendering.#element("th", undefined, field.label);
        if (field.description !== undefined) {
          header.title = field.description;
          header.classList.add("has-description");
        }
        headerRow.append(header);
      }
      tableHead.append(headerRow);

      const tableBody = ResultRendering.#element("tbody");
      for (const group of groups) {
        const row = ResultRendering.#element("tr");
        const role = ResultRendering.#element("td", "identity-key-role-column");
        const title = ResultRendering.#element("strong", undefined, group.title);
        if (group.description !== undefined) {
          title.title = group.description;
          title.classList.add("has-description");
        }
        role.append(title);
        row.append(role);
        for (const field of group.basic) {
          row.append(ResultRendering.#basicFieldCell(field, derived.index, options));
        }
        tableBody.append(row);
      }
      table.append(tableHead, tableBody);
      wrapper.append(table);
      body.append(wrapper);
    }

    card.append(head, body);
    return card;
  }

  static #advancedCard(derived: DerivedRow, options: ResultsRenderOptions): HTMLElement {
    const card = ResultRendering.#element(
      "article",
      `address-card${derived.groups === undefined ? "" : " grouped-result-card"}`,
    );
    const { head, identity } = ResultRendering.#cardHead(derived);
    const selectionLabel = ResultRendering.#element("label", "row-selection");
    const grouped = derived.groups !== undefined;
    const checkbox = ResultRendering.#selectionCheckbox(
      derived.index,
      options.selected.has(derived.index),
      (checked) => options.onSelectionChange(derived.index, checked),
      grouped
        ? `Select ${derived.title} and all of its key slots`
        : `Select result ${derived.index}`,
    );
    selectionLabel.append(
      checkbox,
      document.createTextNode(grouped ? " Select this Identity candidate" : " Select this result"),
    );
    const address = derived.basic.find((field) => field.key === "address" && !field.secret);
    const right = ResultRendering.#element("div", "card-right");
    if (address !== undefined)
      right.append(ResultRendering.#element("div", "address", address.value));
    if (derived.groups !== undefined) {
      right.append(
        ResultRendering.#element(
          "div",
          "identity-profile-badge",
          `${derived.groups.length}-key standard profile`,
        ),
      );
    }
    right.append(selectionLabel);
    head.append(identity, right);

    const body = ResultRendering.#element("div", "address-body");
    if (derived.note !== undefined)
      body.append(ResultRendering.#element("div", "row-note table-empty", derived.note));
    for (const field of derived.basic) {
      body.append(ResultRendering.#fieldRow(field, { scope: "row", row: derived.index }, options));
    }
    const encryptedKey = options.encryptedBip38.get(derived.index);
    if (encryptedKey !== undefined) {
      body.append(
        ResultRendering.#fieldRow(
          {
            key: "bip38EncryptedKey",
            label: "Encrypted private key · BIP38",
            value: encryptedKey,
            secret: true,
          },
          { scope: "row", row: derived.index },
          options,
        ),
      );
    }
    if (derived.advanced.length > 0) {
      const detailRows = ResultRendering.#element("div", "advanced-field-rows");
      for (const field of derived.advanced) {
        detailRows.append(
          ResultRendering.#fieldRow(field, { scope: "row", row: derived.index }, options),
        );
      }
      body.append(detailRows);
    }
    if (derived.groups !== undefined) {
      const groups = ResultRendering.#element("div", "field-groups");
      for (const group of derived.groups) {
        const section = ResultRendering.#element("section", "field-group");
        const groupHead = ResultRendering.#element("div", "field-group-head");
        groupHead.append(ResultRendering.#element("h4", undefined, group.title));
        if (group.description !== undefined) {
          groupHead.append(ResultRendering.#element("p", undefined, group.description));
        }
        section.append(groupHead);
        const fields = ResultRendering.#element("div", "field-group-rows");
        for (const field of [...group.basic, ...group.advanced]) {
          fields.append(
            ResultRendering.#fieldRow(field, { scope: "row", row: derived.index }, options),
          );
        }
        section.append(fields);
        groups.append(section);
      }
      body.append(groups);
    }
    card.append(head, body);
    return card;
  }

  static #resultWindowControls(
    total: number,
    window: ResultWindow,
    options: ResultsRenderOptions,
  ): HTMLElement {
    const navigation = ResultRendering.#element("nav", "result-window-controls");
    navigation.setAttribute("aria-label", "Displayed result window");
    const page = total === 0 ? 0 : Math.floor(window.start / window.size) + 1;
    const pages = total === 0 ? 0 : Math.ceil(total / window.size);
    const range = ResultRendering.#element(
      "span",
      "result-window-range",
      total === 0
        ? "No generated results"
        : `Showing ${window.start + 1}–${window.end} of ${total.toLocaleString()} · page ${page} of ${pages}`,
    );
    const note = ResultRendering.#element(
      "small",
      "result-window-note",
      "Only this visible window is kept in the page DOM.",
    );
    const copy = ResultRendering.#element("div", "result-window-copy");
    copy.append(range, note);

    const actions = ResultRendering.#element("div", "mini-actions");
    const previous = ResultRendering.#element("button", "secondary compact", "Previous");
    const next = ResultRendering.#element("button", "secondary compact", "Next");
    previous.type = "button";
    next.type = "button";
    previous.disabled = window.start === 0;
    next.disabled = window.end >= total;
    previous.addEventListener("click", () =>
      options.onWindowChange(Math.max(0, window.start - window.size)),
    );
    next.addEventListener("click", () => options.onWindowChange(window.start + window.size));
    actions.append(previous, next);
    navigation.append(copy, actions);
    return navigation;
  }

  /** Render a borrowed result without retaining another wallet-result owner. */
  static render(
    summaryRoot: HTMLElement,
    listRoot: HTMLElement,
    noticesRoot: HTMLElement,
    result: DerivationResult,
    options: ResultsRenderOptions,
  ): void {
    RenderedSecrets.clear(summaryRoot);
    RenderedSecrets.clear(listRoot);
    noticesRoot.replaceChildren();

    const accountFields =
      options.mode === "advanced"
        ? [...result.basicSummary, ...result.summary]
        : result.basicSummary;
    if (accountFields.length > 0 || (options.mode === "advanced" && result.summary.length > 0)) {
      const card = ResultRendering.#element("article", "key-card summary-card root-material-card");
      card.append(
        ResultRendering.#element("div", "root-card-kicker", "ACCOUNT-SCOPED MATERIAL"),
        ResultRendering.#element(
          "h3",
          undefined,
          "Account / root details — source of all results below",
        ),
        ResultRendering.#element("div", "path", `${result.pathTemplate} · ${result.networkLabel}`),
        ResultRendering.#element(
          "div",
          "root-warning",
          "Critical: revealing or copying root/account secrets can compromise every address derived from this account, not only one row.",
        ),
      );
      for (const field of accountFields) {
        card.append(ResultRendering.#fieldRow(field, { scope: "summary" }, options));
      }
      summaryRoot.append(card);
    }

    for (const notice of result.notices) {
      noticesRoot.append(ResultRendering.#element("div", "result-help", notice));
    }

    const renderedRows =
      options.rowLimit === undefined ? result.rows : result.rows.slice(0, options.rowLimit);
    const window = new ResultWindow(renderedRows.length, options.windowStart, options.windowSize);
    const visibleRows = renderedRows.slice(window.start, window.end);
    listRoot.append(ResultRendering.#resultWindowControls(renderedRows.length, window, options));

    if (options.mode === "basic") {
      if ((result.rows[0]?.groups?.length ?? 0) > 0) {
        const groupedResults = ResultRendering.#element("div", "grouped-basic-results");
        for (const derived of visibleRows)
          groupedResults.append(ResultRendering.#groupedBasicCard(derived, options));
        listRoot.append(groupedResults);
        return;
      }
      // Every row's fields, so that neither the first row nor the page in view decides the columns.
      const columns = fieldColumns(
        renderedRows.map(({ basic }) => basic),
        ({ key }) => key,
      );
      const wrapper = ResultRendering.#element("div", "basic-table-wrap");
      const table = ResultRendering.#element("table", "basic-results-table");
      const head = ResultRendering.#element("thead");
      const headerRow = ResultRendering.#element("tr");
      headerRow.append(
        ResultRendering.#element("th", "select-column", "Use"),
        ResultRendering.#element("th", "path-column", "Path"),
      );
      for (const field of columns) {
        const header = ResultRendering.#element("th", undefined, field.label);
        header.dataset.fieldKey = field.key;
        if (field.description !== undefined) {
          header.title = field.description;
          header.classList.add("has-description");
        }
        headerRow.append(header);
        if (field.key === "address" && options.encryptedBip38.size > 0) {
          headerRow.append(
            ResultRendering.#element("th", undefined, "Encrypted private key · BIP38"),
          );
        }
      }
      head.append(headerRow);
      const body = ResultRendering.#element("tbody");
      const fieldKeys = columns.map(({ key }) => key);
      ResultRendering.#appendBasicRows(body, visibleRows, fieldKeys, options);
      table.append(head, body);
      wrapper.append(table);
      listRoot.append(wrapper);
      return;
    }

    for (const derived of visibleRows) {
      listRoot.append(ResultRendering.#advancedCard(derived, options));
    }
  }

  /** Update disclosure controls of the supplied result root. */
  static setSecretsVisible(results: HTMLElement, revealed: boolean): void {
    RenderedSecrets.setVisible(results, revealed);
    results.classList.toggle("revealed", revealed);
    for (const button of results.querySelectorAll<HTMLButtonElement>('[data-secret="true"]')) {
      button.disabled = !revealed;
      button.title = revealed
        ? "Copy this sensitive value."
        : "Show private and privacy-sensitive values before copying.";
    }
  }
}

/** Compatibility entry for existing result-table callers. */
export const renderResults = ResultRendering.render.bind(ResultRendering);

/** Compatibility entry for existing disclosure controls. */
export const updateSecretVisibility = ResultRendering.setSecretsVisible.bind(ResultRendering);
