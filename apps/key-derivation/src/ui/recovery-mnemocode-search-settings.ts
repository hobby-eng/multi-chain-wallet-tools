// The optional limits of a MnemoCode search, as its command line takes them: the combinations tried
// without asking first, and for a date search how many candidates are shown and how often progress
// is reported; for shares, the share and date combinations tried without asking. Blank leaves
// MnemoCode's own: a search asks first when it would take longer than twelve hours.
import {
  MnemoCodeSearchSettings,
  type MnemoCodeDateSearchSettings,
} from "@ckd/recovery-backup/mnemocode-search.js";
import type { SearchLimits } from "@ckd/recovery-backup/mnemocode-shares.js";
import { FieldEdits } from "./field-edits.js";
import { required } from "./recovery-workspace-shared.js";

type SettingsKind = "dates" | "missing-codes" | "shares";
const CONSENT_HINT =
  "Leave blank for MnemoCode's assessed-time question. A smaller allowance asks for confirmation; the search still covers every combination.";

/** The limit fields of one search, made in the container its prefix names. */
export class MnemoCodeSearchSettingsFields {
  readonly #kind: SettingsKind;
  readonly #container: HTMLElement;
  readonly #consent: HTMLInputElement;
  readonly #shown: HTMLInputElement | undefined;
  readonly #progress: HTMLInputElement | undefined;
  readonly #tries: HTMLInputElement | undefined;

  constructor(prefix: string, kind: SettingsKind) {
    this.#kind = kind;
    this.#container = required<HTMLElement>(`#${prefix}-search-settings`);
    this.#container.replaceChildren();
    const count = (suffix: string, label: string, hint: string, value = ""): HTMLInputElement => {
      const row = document.createElement("label");
      const title = document.createElement("span");
      title.textContent = label;
      const input = document.createElement("input");
      input.id = `${prefix}-${suffix}`;
      input.type = "number";
      input.step = "1";
      input.min = "1";
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
    );
    if (kind === "shares")
      this.#tries = count("max-tries", "Share combinations allowed without asking", CONSENT_HINT);
    if (kind === "dates") {
      this.#progress = count(
        "progress-every",
        "Combinations between progress updates",
        "Leave blank for an update every few thousand. This changes progress reporting only.",
      );
      this.#shown = count(
        "max-results",
        "Candidates shown",
        "Only display retention changes. Wallet comparison and a requested candidate file still cover the full search.",
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
    const maxCandidates = MnemoCodeSearchSettings.parseCount(this.#consent.value, "maxCandidates");
    const maxShown = MnemoCodeSearchSettings.parseCount(this.#shown?.value, "maxShown");
    const progressEvery = MnemoCodeSearchSettings.parseCount(
      this.#progress?.value,
      "progressEvery",
    );
    return {
      ...(maxCandidates === undefined ? {} : { maxCandidates }),
      ...(maxShown === undefined ? {} : { maxShown }),
      ...(progressEvery === undefined ? {} : { progressEvery }),
    };
  }

  /** The limits of a restore or a repair of shares. */
  get limits(): SearchLimits {
    if (this.#kind !== "shares" || this.#tries === undefined)
      throw new Error("Share limits apply only to share settings.");
    const dates = MnemoCodeSearchSettings.parseCount(this.#consent.value, "maxCandidates");
    const shares = MnemoCodeSearchSettings.parseCount(this.#tries.value, "maxTries");
    return {
      ...(shares === undefined ? {} : { shares }),
      ...(dates === undefined ? {} : { dates }),
    };
  }
}
