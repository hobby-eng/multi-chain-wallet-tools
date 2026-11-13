const MAX_BYTES = 64 * 1024;
const LIMIT_LABEL = `${MAX_BYTES / 1024} KiB`;
const REFUSALS = {
  EMPTY_MESSAGE: "Enter a message to sign.",
  INVALID_MESSAGE: "The message must be well-formed text.",
  MESSAGE_TOO_LARGE: `The message exceeds the ${LIMIT_LABEL} UTF-8 limit.`,
} as const;

/** Input-free message admission failures, before hashing or copying to a worker. */
export class SigningMessageError extends Error {
  readonly code: keyof typeof REFUSALS;

  constructor(code: keyof typeof REFUSALS) {
    super(REFUSALS[code]);
    this.name = "SigningMessageError";
    this.code = code;
  }
}

/**
 * The UTF-8 length of `value`, counted until it passes `limit`; undefined when it holds a lone
 * surrogate, which UTF-8 cannot encode, before that point.
 */
function utf8Length(value: string, limit: number): number | undefined {
  let bytes = 0;
  for (const character of value) {
    const point = character.codePointAt(0);
    if (point === undefined || (point >= 0xd800 && point <= 0xdfff)) return undefined;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (bytes > limit) return bytes;
  }
  return bytes;
}

/**
 * The UTF-8 bytes of a standard's short text input, such as NEAR's recipient: undefined for a value
 * that is not text, holds a lone surrogate or passes `maxBytes`, so that no two texts sign the
 * same bytes.
 */
export function utf8Text(value: unknown, maxBytes: number): Uint8Array | undefined {
  if (typeof value !== "string") return undefined;
  const bytes = utf8Length(value, maxBytes);
  return bytes === undefined || bytes > maxBytes ? undefined : new TextEncoder().encode(value);
}

/** Admits exact message text without trimming, normalization or an encoded staging buffer. */
export class SigningMessage {
  /** Operational text limit in UTF-8 bytes, shared by signing and verification. */
  static readonly maxBytes = MAX_BYTES;
  /** A page's hint is derived from the same bound as its refusal. */
  static readonly help = `Up to ${LIMIT_LABEL} of UTF-8 text. Spaces and line breaks are signed exactly as entered.`;

  /** Refuses malformed or oversized text; verification may admit the standard empty message. */
  static require(value: unknown, allowEmpty = false): asserts value is string {
    if (typeof value !== "string") throw new SigningMessageError("INVALID_MESSAGE");
    if (!allowEmpty && value.length === 0) throw new SigningMessageError("EMPTY_MESSAGE");
    if (value.length > SigningMessage.maxBytes) throw new SigningMessageError("MESSAGE_TOO_LARGE");
    const bytes = utf8Length(value, SigningMessage.maxBytes);
    if (bytes === undefined) throw new SigningMessageError("INVALID_MESSAGE");
    if (bytes > SigningMessage.maxBytes) throw new SigningMessageError("MESSAGE_TOO_LARGE");
  }
}
