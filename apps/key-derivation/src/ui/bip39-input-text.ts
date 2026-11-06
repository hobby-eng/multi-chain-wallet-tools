import { Bip39Input, Bip39InputError } from "@ckd/core/bip39-input.js";

/** One page catalogue for bounded phrase admission, without repeating any entered text. */
export class Bip39InputText {
  /** A refused count remains unavailable, never an invented empty phrase. */
  static readonly COUNT_UNAVAILABLE = "Word count unavailable";

  /** Shared with worker-error presentation so transport keeps the same input-free wording. */
  static readonly MESSAGES = Object.freeze({
    "bip39.input.text": "Enter the recovery phrase as text.",
    "bip39.input.text-size": `The recovery phrase exceeds the ${Bip39Input.maximumTextUnits} UTF-16 code unit limit. Shorten the input; it has not been truncated.`,
    "bip39.input.diagnostic-count": `The diagnostic accepts at most ${Bip39Input.maximumDiagnosticWords} words. Shorten the input to inspect it.`,
  } satisfies Record<Bip39InputError["code"], string>);

  /** Known local input refusals only; unexpected failures stay with their caller. */
  static of(cause: unknown): string | undefined {
    if (!(cause instanceof Bip39InputError)) return undefined;
    return this.MESSAGES[cause.code];
  }
}
