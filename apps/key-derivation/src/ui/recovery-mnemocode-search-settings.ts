import {
  MnemoCodeSearchSettings,
  type MnemoCodeDateSearchSettings,
} from "@ckd/recovery-backup/mnemocode-search.js";
import type { SearchLimits } from "../../../../packages/recovery-mnemocode/source/sskr/share-restore.js";
import { FieldEdits } from "./field-edits.js";
import { required } from "./recovery-workspace-shared.js";

type SettingsKind = "dates" | "missing-codes" | "shares";
const CONSENT_HINT =
  "Leave blank for the library's assessed-time question. A smaller allowance asks for confirmation; the search still covers every combination.";

/** Common control rendering; share maxima come from the share feature, never a runtime import. */
export class MnemoCodeSearchSettingsFields {
  readonly #kind: SettingsKind;
  readonly #container: HTMLElement;
  readonly #consent: HTMLInputElement;
  readonly #shown: HTMLInputElement | undefined;
  readonly #progress: HTMLInputElement | undefined;
  readonly #tries: HTMLInputElement | undefined;
  readonly #shareRange: typeof MnemoCodeSearchSettings.countRange | undefined;

  constructor(prefix: string, kind: "dates" | "missing-codes");
  constructor(prefix: string, kind: "shares", shareAllowanceMaximum: number);
  constructor(prefix: string, kind: SettingsKind, shareAllowanceMaximum?: number) {
    this.#kind = kind;
    this.#container = required<HTMLElement>(`#${prefix}-search-settings`);
    this.#container.replaceChildren();
    if (kind === "shares") {
      if (shareAllowanceMaximum === undefined)
        throw new Error("Share settings need the share feature's core allowance bound.");
      this.#shareRange = MnemoCodeSearchSettings.boundedCountRange(shareAllowanceMaximum);
    }
    const count = (
      suffix: string,
      label: string,
      hint: string,
      range: typeof MnemoCodeSearchSettings.countRange,
      value = "",
    ): HTMLInputElement => {
      const row = document.createElement("label");
      const title = document.createElement("span");
      title.textContent = label;
      const input = document.createElement("input");
      input.id = `${prefix}-${suffix}`;
      input.type = "number";
      input.step = "1";
      input.min = String(range.min);
      input.max = String(range.max);
      input.value = value;
      const note = document.createElement("span");
      note.className = "field-note";
      note.textContent = hint;
      row.append(title, input, note);
      this.#container.append(row);
      return input;
    };
    this.#consent = count(
      "max-candidates",
      kind === "shares"
        ? "Date combinations allowed without asking"
        : "Combinations allowed without asking",
      CONSENT_HINT,
      MnemoCodeSearchSettings.consentRange,
    );
    if (this.#shareRange !== undefined)
      this.#tries = count(
        "max-tries",
        "Share combinations allowed without asking",
        CONSENT_HINT,
        this.#shareRange,
      );
    if (kind === "dates") {
      this.#progress = count(
        "progress-every",
        "Combinations between progress updates",
        "Leave blank for an update at each search turn. This changes progress reporting only.",
        MnemoCodeSearchSettings.countRange,
      );
      this.#shown = count(
        "max-results",
        "Candidates shown",
        "Only display retention changes. Wallet comparison and a requested candidate file still cover the full search.",
        MnemoCodeSearchSettings.countRange,
        String(MnemoCodeSearchSettings.defaultMaxShown),
      );
    }
  }

  /** Watch generated controls through their owner container, without copying a field list. */
  onEdit(listener: () => void): void {
    const edits = new FieldEdits();
    for (const type of ["input", "change"])
      this.#container.addEventListener(type, (event) => {
        if (edits.isNew(event)) listener();
      });
  }

  set available(available: boolean) {
    for (const field of [this.#consent, this.#shown, this.#progress, this.#tries]) {
      if (field === undefined) continue;
      field.disabled = !available;
      const label = field.closest<HTMLElement>("label");
      if (label !== null) label.hidden = !available;
    }
  }

  get request(): MnemoCodeDateSearchSettings {
    if (this.#kind === "shares")
      throw new Error("Share settings use limits, not a non-share search request.");
    return MnemoCodeSearchSettings.parse(this.#kind, {
      maxCandidates: this.#consent.value,
      ...(this.#shown === undefined ? {} : { maxShown: this.#shown.value }),
      ...(this.#progress === undefined ? {} : { progressEvery: this.#progress.value }),
    }).request;
  }

  /** The core share contract; the owner forwards this to restore/repair without loop cutoffs. */
  get limits(): SearchLimits {
    if (this.#kind !== "shares" || this.#shareRange === undefined || this.#tries === undefined)
      throw new Error("Share limits apply only to share settings.");
    const { maxCandidates } = MnemoCodeSearchSettings.parse("missing-codes", {
      maxCandidates: this.#consent.value,
    }).request;
    const shares = MnemoCodeSearchSettings.parseCount(
      this.#tries.value,
      this.#shareRange,
      "maxTries",
    );
    return {
      ...(shares === undefined ? {} : { shares }),
      ...(maxCandidates === undefined ? {} : { dates: maxCandidates }),
    };
  }
}
