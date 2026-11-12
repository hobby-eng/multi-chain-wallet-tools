import type { MessageSigningFormat } from "../workers/protocol.js";

/** The label of a signature written in Base64, as most standards write it. */
export const BASE64_SIGNATURE = "Base64 signature";

/** What the page says about one signing format. */
export interface MessageFormatText {
  /** The format and its standard, in the dialog's Format line and the format menu. */
  readonly label: string;
  /** The label of the signature's text, such as BASE64_SIGNATURE. */
  readonly output: string;
  /** Notes shown under the format: who verifies it, and what else it is valid for. */
  readonly notes: readonly string[];
  /** Whether its signature is the 65-byte compact form, which the dialog recognises when pasted. */
  readonly compact?: boolean;
}

/** A coin's message-signing offers: which formats each address field signs, and their texts. */
export interface MessageSigningPolicy {
  /**
   * The formats offered for the address field `addressKey` of a `resultId` row, the default first;
   * none means that the field has no signing action.
   */
  offer(resultId: string, addressKey: string): readonly MessageSigningFormat[];
  /** The texts of an offered format; undefined for any other value. */
  describe(format: unknown): MessageFormatText | undefined;
}

const NONE: readonly MessageSigningFormat[] = Object.freeze([]);

/** One result's offer: the address fields with a signing action, and their formats. */
export interface MessageSigningOffer {
  readonly fields: readonly string[];
  /** The default first. */
  readonly formats: readonly MessageSigningFormat[];
}

/** A coin policy given as data: its offers by result id, and the texts of its formats. */
export class TableMessageSigningPolicy implements MessageSigningPolicy {
  readonly #offers: Readonly<Record<string, MessageSigningOffer>>;
  readonly #texts: ReadonlyMap<unknown, MessageFormatText>;

  constructor(
    offers: Readonly<Record<string, MessageSigningOffer>>,
    texts: ReadonlyMap<MessageSigningFormat, MessageFormatText>,
  ) {
    this.#offers = offers;
    this.#texts = texts;
  }

  /** The formats of a result's offered field; none for another field or result. */
  offer(resultId: string, addressKey: string): readonly MessageSigningFormat[] {
    const offer = Object.hasOwn(this.#offers, resultId) ? this.#offers[resultId] : undefined;
    return offer?.fields.includes(addressKey) === true ? offer.formats : NONE;
  }

  /** Texts only for this coin's formats. */
  describe(format: unknown): MessageFormatText | undefined {
    return this.#texts.get(format);
  }
}

/** Composes coin-owned offers without interpreting caller strings as format values. */
export class MessageSigningPolicies implements MessageSigningPolicy {
  readonly #policies: readonly MessageSigningPolicy[];

  constructor(policies: readonly MessageSigningPolicy[]) {
    this.#policies = [...policies];
  }

  /** The offers of the first coin policy that owns this address field. */
  offer(resultId: string, addressKey: string): readonly MessageSigningFormat[] {
    for (const policy of this.#policies) {
      const offered = policy.offer(resultId, addressKey);
      if (offered.length > 0) return offered;
    }
    return NONE;
  }

  /** The texts from the policy that owns the format. */
  describe(format: unknown): MessageFormatText | undefined {
    for (const policy of this.#policies) {
      const text = policy.describe(format);
      if (text !== undefined) return text;
    }
    return undefined;
  }
}

/** Composition entry for the edition's selected coin policies. */
export function combineMessageSigningPolicies(
  ...policies: readonly MessageSigningPolicy[]
): MessageSigningPolicy {
  return new MessageSigningPolicies(policies);
}
