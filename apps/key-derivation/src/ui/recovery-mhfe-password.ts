// The Password tab of the MHFE panel (`mhfe password`): makes a password of words from the EFF list,
// of words with a check word, or of random characters, from the browser's random generator inside
// the package's worker or from real dice. A quick call: nothing to cancel.
import { concealedValue } from "./recovery-mhfe-cards.js";
import type { MhfePasswordsParameters } from "@ckd/recovery-mhfe-wasm/passwords/passwords.js";
import { InputRevision } from "./recovery-input-revision.js";
import type { MhfeEngine } from "./recovery-mhfe-engine.js";
import { describe } from "./recovery-mhfe-status.js";
import { installSecretToggle, paragraph, required } from "./recovery-workspace-shared.js";

type PasswordKind = "words" | "checkWord" | "characters";

function strengthLine(kind: PasswordKind, count: number, bits: number): string {
  const rounded = bits.toFixed(1);
  if (kind === "characters") return `${count} random characters, about ${rounded} bits.`;
  if (kind === "checkWord")
    return (
      `${count} words from the EFF list and a check word, about ${rounded} bits. The last word is ` +
      "the check word; it adds no strength and is just as secret."
    );
  return `${count} words from the EFF list, about ${rounded} bits.`;
}

export class MhfePasswordTab {
  readonly #engine: MhfeEngine;
  readonly #count = required<HTMLInputElement>("#mhfe-password-count");
  readonly #countLabel = required<HTMLElement>("#mhfe-password-count-label");
  readonly #dice = required<HTMLInputElement>("#mhfe-password-dice");
  readonly #rolls = required<HTMLTextAreaElement>("#mhfe-password-rolls");
  readonly #result = required<HTMLElement>("#mhfe-password-result");
  readonly #make = required<HTMLButtonElement>("#mhfe-password-make");
  readonly #inputs: InputRevision;
  #parameters: MhfePasswordsParameters | undefined;

  constructor(engine: MhfeEngine) {
    this.#engine = engine;
    this.#inputs = new InputRevision(required<HTMLElement>("#mhfe-password-panel"), () =>
      this.#result.replaceChildren(),
    );
    this.#inputs.bindPageLifetime();
    engine.whenPassed(() => {
      void engine
        .passwordParameters()
        .then((parameters) => {
          this.#parameters = parameters;
          this.#showKind();
        })
        .catch((cause) =>
          this.#result.replaceChildren(
            paragraph(
              describe(cause, "Password parameters could not be loaded."),
              "warning-callout",
            ),
          ),
        );
    });
    installSecretToggle(
      "#toggle-mhfe-password-rolls",
      "#mhfe-password-rolls",
      "Show",
      "Hide",
      "dice rolls",
    );
    for (const radio of this.#kindRadios())
      radio.addEventListener("change", () => {
        this.#result.replaceChildren();
        this.#showKind();
      });
    this.#dice.addEventListener("change", () => this.#showKind());
    this.#make.addEventListener("click", () => this.#makePassword());
    this.#showKind();
  }

  #kindRadios(): HTMLInputElement[] {
    return [...document.querySelectorAll<HTMLInputElement>('input[name="mhfe-password-kind"]')];
  }

  #kind(): PasswordKind {
    return (this.#kindRadios().find((radio) => radio.checked)?.value ?? "words") as PasswordKind;
  }

  /** The count follows the kind; dice make words only. */
  #showKind(): void {
    const kind = this.#kind();
    required<HTMLElement>("#mhfe-password-count-field").hidden = kind === "checkWord";
    this.#countLabel.textContent =
      kind === "characters" ? "Number of characters" : "Number of words";
    const parameters = this.#parameters;
    if (parameters !== undefined) {
      this.#count.max = String(
        kind === "characters" ? parameters.mostCharacters : parameters.mostWords,
      );
      if (document.activeElement !== this.#count)
        this.#count.value = String(
          kind === "characters" ? parameters.defaultCharacters : parameters.defaultWords,
        );
    }
    this.#dice.disabled = kind === "characters";
    if (kind === "characters") this.#dice.checked = false;
    required<HTMLElement>("#mhfe-password-rolls-field").hidden = !this.#dice.checked;
  }

  #makePassword(): void {
    if (this.#make.disabled) return;
    const current = this.#inputs.capture();
    this.#make.disabled = true;
    this.#result.replaceChildren();
    const kind = this.#kind();
    const count = Number(this.#count.value);
    const dice = this.#dice.checked ? { dice: this.#rolls.value } : {};
    void this.#engine
      .passwords()
      .then((passwords) => {
        if (!current()) return undefined;
        // A check-word password always has five words and takes no count, as `mhfe password
        // --check-word` refuses --words.
        return passwords.make(kind === "checkWord" ? { kind, ...dice } : { kind, count, ...dice });
      })
      .then(
        (made) => {
          if (made === undefined || !current()) return;
          this.#rolls.value = "";
          if (made.weak)
            this.#result.append(
              paragraph(
                `MHFE rates this password as weak: about ${made.bits.toFixed(1)} bits. Increase the count or use the module's recommended default.`,
                "warning-callout",
              ),
            );
          // No Copy: typing the password from the written copy into Encode, twice, also tests the
          // copy, and the clipboard keeps nothing.
          const { output, actions } = concealedValue(
            made.password,
            { subject: "password" },
            undefined,
          );
          this.#result.append(
            output,
            actions,
            paragraph(
              strengthLine(
                kind,
                kind === "characters"
                  ? made.password.length
                  : made.password.trim().split(/\s+/u).length - Number(kind === "checkWord"),
                made.bits,
              ),
              "field-note",
            ),
            paragraph(
              "Not stored: write it down, apart from the container. It disappears when you make another one or " +
                "leave the page.",
              "field-note",
            ),
          );
          this.#make.textContent = "Make another";
        },
        (cause: unknown) => {
          if (!current()) return;
          this.#result.append(
            paragraph(describe(cause, "No password was made."), "warning-callout"),
          );
        },
      )
      .finally(() => {
        this.#make.disabled = false;
      });
  }
}
