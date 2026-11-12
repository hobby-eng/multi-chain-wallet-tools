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
