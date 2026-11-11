// The decoy of a hidden SeedQR on Encode: a choice of kind and, for each kind, its own fields, built
// from the library's kinds (packages/recovery-backup/src/decoy-qr-text.ts) so that the page holds
// no second list of them. Only the chosen kind's fields show. The values are the visible text of a
// QR: not secret, but read only when a SeedQR is made.
import {
  DECOY_KINDS,
  decoyKind,
  type DecoyField,
  type DecoyKind,
} from "@ckd/recovery-backup/decoy-qr-text.js";
import { required } from "./recovery-workspace-shared.js";

type DecoyControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/** Rows of a decoy text field of several lines. */
const TEXT_ROWS = 3;

/** The control that asks `field`, with the id its label names. */
function decoyControl(field: DecoyField, id: string): DecoyControl {
  let control: DecoyControl;
  if (field.input === "choice") {
    control = document.createElement("select");
    for (const choice of field.choices ?? []) {
      const option = document.createElement("option");
      option.value = choice.value;
      option.textContent = choice.label;
      control.append(option);
    }
  } else if (field.input === "lines") {
    control = document.createElement("textarea");
    control.rows = TEXT_ROWS;
  } else {
    control = document.createElement("input");
    control.type = field.type ?? "text";
  }
  control.id = id;
  control.autocomplete = "off";
  control.spellcheck = false;
  return control;
}

/** One kind's block of fields, shown while the kind is chosen. */
class DecoyKindFields {
  readonly kind: DecoyKind;
  readonly block = document.createElement("div");
  readonly #controls: readonly (readonly [DecoyField, DecoyControl])[];

  constructor(kind: DecoyKind) {
    this.kind = kind;
    this.block.className = "operation-block";
    this.#controls = kind.fields.map((field) => {
      const control = decoyControl(field, `seedqr-decoy-${kind.id}-${field.name}`);
      const label = document.createElement("label");
      label.htmlFor = control.id;
      label.append(field.label);
      if (field.note !== undefined) {
        const note = document.createElement("span");
        note.className = "answer-note";
        note.textContent = field.note;
        label.append(" ", note);
      }
      label.append(control);
      this.block.append(label);
      return [field, control] as const;
    });
  }

  /** The visible text of the values typed; refuses as the kind refuses. */
  text(): string {
    return this.kind.text(
      Object.fromEntries(this.#controls.map(([field, control]) => [field.name, control.value])),
    );
  }
}

/** The decoy's kind and fields: #seedqr-decoy-kind and #seedqr-decoy-fields. */
export class DecoyFields {
  readonly #choice = required<HTMLSelectElement>("#seedqr-decoy-kind");
  readonly #kinds = DECOY_KINDS.map((kind) => new DecoyKindFields(kind));

  constructor() {
    for (const { kind } of this.#kinds) {
      const option = document.createElement("option");
      option.value = kind.id;
      option.textContent = kind.label;
      this.#choice.append(option);
    }
    required<HTMLElement>("#seedqr-decoy-fields").append(...this.#kinds.map(({ block }) => block));
    this.#choice.addEventListener("change", () => this.#showChosen());
    this.#showChosen();
  }

  /** The chosen kind. */
  get kind(): DecoyKind {
    return this.#chosen().kind;
  }

  /** The visible text of the chosen kind; refuses an empty required field or a malformed value. */
  text(): string {
    return this.#chosen().text();
  }

  #chosen(): DecoyKindFields {
    // decoyKind refuses a value that names no kind; the select offers exactly the kinds.
    const kind = decoyKind(this.#choice.value);
    const fields = this.#kinds.find((candidate) => candidate.kind === kind);
    if (fields === undefined) throw new TypeError("The decoy form has no fields for its kind.");
    return fields;
  }

  #showChosen(): void {
    const chosen = this.#chosen();
    for (const fields of this.#kinds) fields.block.hidden = fields !== chosen;
  }
}
