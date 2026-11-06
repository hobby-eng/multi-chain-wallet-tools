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
    let bytes = 0;
    for (const character of value) {
      const point = character.codePointAt(0);
      if (point === undefined || (point >= 0xd800 && point <= 0xdfff))
        throw new SigningMessageError("INVALID_MESSAGE");
      bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
      if (bytes > SigningMessage.maxBytes) throw new SigningMessageError("MESSAGE_TOO_LARGE");
    }
  }
}
