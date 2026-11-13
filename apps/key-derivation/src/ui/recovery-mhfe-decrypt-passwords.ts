// The passwords of MHFE's Decode, as mhfe's menu asks them before any work (src/bin/mhfe/
// decrypt.rs): the first in the tab's own fields, then "Recover now, or add another password?".
// Each added password has its own PIM, the first password's until changed, and its own check word
// review; the memory level is 0 in a browser. A stated length with a built-in check refuses every
// password but the container's own, so with one the tab offers no other password and leaves out
// those added, as mhfe does.
import type { MhfeEngine } from "./recovery-mhfe-engine.js";
import { ContainerPassword } from "./recovery-mhfe-fields.js";
import { installMhfeWordHints } from "./recovery-mhfe-word-hints.js";
import { required } from "./recovery-workspace-shared.js";

/** The label of the first password while it is the only one. */
const ONE_PASSWORD = "MHFE password";

interface AddedPassword {
  readonly entry: HTMLElement;
  readonly label: HTMLLabelElement;
  readonly password: ContainerPassword;
}

/** An element of `tag` with `attributes`, and `children` in it. */
function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Readonly<Record<string, string>> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const made = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) made.setAttribute(name, value);
  made.append(...children);
  return made;
}

/** The fields of an added password, as the tab's first password has them; `id` prefixes each. */
function passwordEntry(id: string): {
  readonly entry: HTMLElement;
  readonly label: HTMLLabelElement;
  readonly remove: HTMLButtonElement;
} {
  const label = element("label", { for: `${id}-password` });
  const remove = element(
    "button",
    { type: "button", class: "secondary compact" },
    "Remove this password",
  );
  const entry = element(
    "div",
    { class: "mhfe-added-password" },
    element(
      "div",
      { class: "mhfe-password-field" },
      element(
        "div",
        { class: "field-heading-row" },
        label,
        element(
          "button",
          {
            id: `toggle-${id}-password`,
            class: "secondary compact",
            type: "button",
            "aria-pressed": "false",
          },
          "Show",
        ),
      ),
      element("input", {
        id: `${id}-password`,
        "data-word-list": "eff",
        type: "password",
        autocomplete: "off",
      }),
    ),
    element(
      "fieldset",
      { id: `${id}-password-review`, class: "choice-group mhfe-password-review", hidden: "" },
      element("legend", {}, "Repair the password with its check word?"),
      element("p", { class: "field-note mhfe-review-explanation" }),
      element("div", { class: "mhfe-review-answers concealed" }),
      element(
        "button",
        {
          id: `toggle-${id}-password-review`,
          class: "danger-outline compact",
          type: "button",
          "aria-pressed": "false",
        },
        "Show words",
      ),
    ),
    element(
      "label",
      { class: "checkbox-row", for: `${id}-use-pim` },
      element("input", { id: `${id}-use-pim`, type: "checkbox" }),
      " Use a custom PIM",
    ),
    element(
      "label",
      { id: `${id}-pim-field`, for: `${id}-pim`, hidden: "" },
      "PIM (1–1023)",
      element("input", { id: `${id}-pim`, type: "number", min: "1", step: "1", value: "1" }),
    ),
    element("div", { class: "actions" }, remove),
  );
  return { entry, label, remove };
}

export class DecryptPasswords {
  readonly #engine: MhfeEngine;
  readonly #first: ContainerPassword;
  readonly #firstLabel = required<HTMLLabelElement>('label[for="mhfe-decrypt-password"]');
  readonly #list = required<HTMLElement>("#mhfe-decrypt-more-passwords");
  readonly #add = required<HTMLButtonElement>("#mhfe-decrypt-add-password");
  readonly #note = required<HTMLElement>("#mhfe-decrypt-several-note");
  readonly #added: AddedPassword[] = [];
  /** Numbers the fields of added passwords; a number is never given twice in a page's life. */
  #serial = 1;
  #single = false;

  constructor(engine: MhfeEngine, first: ContainerPassword) {
    this.#engine = engine;
    this.#first = first;
    this.#add.addEventListener("click", () => this.#addPassword());
    document.querySelector("#clear-all")?.addEventListener("click", () => this.#removeAll());
    window.addEventListener("pagehide", () => this.#removeAll());
    this.#show();
  }

  /** The passwords that a recovery uses, in order. */
  get used(): readonly ContainerPassword[] {
    return this.#single
      ? [this.#first]
      : [this.#first, ...this.#added.map(({ password }) => password)];
  }

  /** One password only: a stated length with a built-in check takes the container's own alone. */
  set single(single: boolean) {
    this.#single = single;
    this.#show();
  }

  #addPassword(): void {
    this.#serial += 1;
    const id = `mhfe-decrypt-${this.#serial}`;
    const { entry, label, remove } = passwordEntry(id);
    this.#list.append(entry);
    installMhfeWordHints(this.#engine, entry);
    const password = new ContainerPassword(this.#engine, `decrypt-${this.#serial}`, "password");
    // Its PIM is the first password's until it is changed, as mhfe offers it.
    const pim = required<HTMLInputElement>(`#${id}-use-pim`);
    pim.checked = required<HTMLInputElement>("#mhfe-decrypt-use-pim").checked;
    required<HTMLInputElement>(`#${id}-pim`).value =
      required<HTMLInputElement>("#mhfe-decrypt-pim").value;
    pim.dispatchEvent(new Event("change"));
    const added = { entry, label, password };
    this.#added.push(added);
    remove.addEventListener("click", () => this.#remove(added));
    this.#show();
    this.#changed();
    password.password.input.focus();
  }

  #remove(added: AddedPassword): void {
    added.password.password.clear();
    added.entry.remove();
    this.#added.splice(this.#added.indexOf(added), 1);
    this.#show();
    this.#changed();
  }

  #removeAll(): void {
    for (const added of this.#added.splice(0)) {
      added.password.password.clear();
      added.entry.remove();
    }
    this.#show();
    this.#changed();
  }

  /** Another set of passwords drops a result shown for the former set, as typing does. */
  #changed(): void {
    this.#list.dispatchEvent(new Event("change", { bubbles: true }));
  }

  #show(): void {
    this.#add.hidden = this.#single;
    this.#note.hidden = this.#single;
    this.#list.hidden = this.#single;
    const several = !this.#single && this.#added.length > 0;
    this.#firstLabel.textContent = several ? "Password 1" : ONE_PASSWORD;
    this.#added.forEach(({ label }, index) => {
      label.textContent = `Password ${index + 2}`;
    });
  }
}
