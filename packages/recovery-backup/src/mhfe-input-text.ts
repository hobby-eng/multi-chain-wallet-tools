import { SecretValue } from "@ckd/core/secret-value.js";

/**
 * The most raw UTF-8 bytes of one phrase, container or repair-word field: the line MHFE's command
 * line reads (TYPED_LINE_BYTES of MHFE's memory.rs). MHFE's browser package publishes no limit of
 * its own, so the page admits a field to this bound before it keeps a copy.
 */
export const MHFE_INPUT_TEXT_BYTES = 8_192;

/** Stable host refusal of a malformed or oversized input. */
export class MhfeInputTextError extends Error {
  readonly code = "mhfe.input.admission";
  constructor(message = "The MHFE input could not be admitted.", cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "MhfeInputTextError";
  }
}

/** A lone surrogate: text that is no well-formed UTF-16 and has no UTF-8 form. */
const LONE_SURROGATE = /\p{Surrogate}/u;

/** The UTF-8 length of well-formed `text`, counted without encoding it. */
function utf8Length(text: string): number {
  let bytes = 0;
  for (const character of text) {
    const point = character.codePointAt(0) ?? 0;
    bytes += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/**
 * One borrowed MHFE phrase, container or repair-word field admitted before a retained copy.
 * Password/passphrase rules remain with their separate MHFE operations.
 */
export class MhfeInputText implements Disposable {
  readonly #value: SecretValue<string>;

  constructor(value: unknown) {
    if (typeof value !== "string" || LONE_SURROGATE.test(value)) throw new MhfeInputTextError();
    if (utf8Length(value) > MHFE_INPUT_TEXT_BYTES)
      throw new MhfeInputTextError(
        `The MHFE input is longer than ${MHFE_INPUT_TEXT_BYTES.toLocaleString("en-US")} bytes.`,
      );
    this.#value = SecretValue.text(value);
  }

  /** Refuses a new operation after this input's owned bytes have been wiped. */
  assertLive(): void {
    this.#value.assertLive();
  }

  /** A separately disposable snapshot for an operation that outlives its displayed source. */
  copy(): MhfeInputText {
    return this.use((text) => new MhfeInputText(text));
  }

  /** Supplies a temporary string in a synchronous adapter frame, including calls returning promises. */
  use<Result>(action: (text: string) => Result): Result {
    return action(this.#value.value);
  }

  /** Drops owned bytes; runtime copies and strings previously given to a caller cannot be recalled. */
  wipe(): void {
    this.#value.wipe();
  }

  /** Ends the borrowed input lifetime, including failed or cancelled operations. */
  [Symbol.dispose](): void {
    this.wipe();
  }
}

/** Refuses sharing ownership of one snapshot between overlapping operations. */
export class MhfeInputLifetimeError extends Error {
  readonly code = "mhfe.input.owned";
  constructor() {
    super("The MHFE input already belongs to an active operation.");
    this.name = "MhfeInputLifetimeError";
  }
}

/**
 * Owns active borrowed inputs until completion or explicit retirement, whichever comes first.
 * Retirement wipes managed bytes immediately, even while a worker's reply remains pending.
 * Previously supplied strings and copies inside the worker remain outside this owner's control.
 */
export class MhfeInputLifetime implements Disposable {
  readonly #active = new Set<MhfeInputText>();

  /** Takes sole ownership; always wipes on completion, failure or an intervening wipe(). */
  async hold<Result>(
    input: MhfeInputText,
    action: (input: MhfeInputText) => Promise<Result>,
  ): Promise<Result> {
    input.assertLive();
    if (this.#active.has(input)) throw new MhfeInputLifetimeError();
    this.#active.add(input);
    try {
      return await action(input);
    } finally {
      input.wipe();
      this.#active.delete(input);
    }
  }

  /** Retires current operations; subsequent operations receive their own independent lifetime. */
  wipe(): void {
    const active = Array.from(this.#active);
    this.#active.clear();
    for (const input of active) input.wipe();
  }

  /** Wipes every still-pending input when the host owning this registry ends. */
  [Symbol.dispose](): void {
    this.wipe();
  }
}
