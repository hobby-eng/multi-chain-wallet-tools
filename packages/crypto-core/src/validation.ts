const DEFAULT_CONCURRENCY_MAXIMUM = 5;
const MAX_INTEGER_TEXT_UNITS = 64;
// Native number controls use decimal notation, including fractions/exponents that evaluate to integers.
const DECIMAL_NUMBER_TEXT = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu;

/** Invalid integer text; its value is never included in the failure. */
export class IntegerInputError extends Error {
  readonly code: "input.integer.invalid" | "input.integer.text-size";
  constructor(
    label: string,
    minimum: number,
    maximum?: number,
    code: IntegerInputError["code"] = "input.integer.invalid",
  ) {
    super(
      code === "input.integer.text-size"
        ? `${label} text must fit ${MAX_INTEGER_TEXT_UNITS} characters.`
        : maximum === undefined
          ? `${label} must be a whole number of at least ${minimum}.`
          : `${label} must be an integer from ${minimum} to ${maximum}.`,
    );
    this.name = "IntegerInputError";
    this.code = code;
  }
}

/** One bounded numeric conversion for native controls and other text front ends. */
export class IntegerInput {
  /** Maximum raw UTF-16 code units, checked before trimming or numeric conversion. */
  static get maximumTextUnits(): number {
    return MAX_INTEGER_TEXT_UNITS;
  }

  /** Parse a nonempty safe integer; label is caller-controlled public field metadata, never input text. */
  static parse(value: unknown, label: string, minimum = 0, maximum?: number): number {
    if (typeof value === "string" && value.length > MAX_INTEGER_TEXT_UNITS)
      throw new IntegerInputError(label, minimum, maximum, "input.integer.text-size");
    if (
      !Number.isSafeInteger(minimum) ||
      !Number.isSafeInteger(maximum ?? Number.MAX_SAFE_INTEGER) ||
      minimum > (maximum ?? Number.MAX_SAFE_INTEGER) ||
      typeof value !== "string" ||
      !DECIMAL_NUMBER_TEXT.test(value.trim())
    )
      throw new IntegerInputError(label, minimum, maximum);
    const parsed = Number(value);
    if (
      !Number.isSafeInteger(parsed) ||
      parsed < minimum ||
      parsed > (maximum ?? Number.MAX_SAFE_INTEGER)
    )
      throw new IntegerInputError(label, minimum, maximum);
    return parsed;
  }

  /** Admit a positive worker count under the caller's explicit concurrency bound. */
  static concurrency(
    value: unknown,
    label = "Concurrency",
    maximum = DEFAULT_CONCURRENCY_MAXIMUM,
  ): number {
    return IntegerInput.parse(value, label, 1, maximum);
  }
}

/** Compatibility entry; an optional upper bound shares the same admission used by native fields. */
export const parseInteger = IntegerInput.parse.bind(IntegerInput);
/** Compatibility entry for positive bounded concurrency. */
export const parseConcurrency = IntegerInput.concurrency.bind(IntegerInput);
