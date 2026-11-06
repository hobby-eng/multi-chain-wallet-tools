import type { MessageSigningFormat } from "../workers/protocol.js";

export interface MessageSigningPolicy {
  format(resultId: string): MessageSigningFormat | null;
  label(format: unknown): string;
  allowsLegacyChoice(resultId: string): boolean;
  choose(resultId: string, selection: unknown): MessageSigningFormat | null;
}

/** Composes coin-owned format choices without interpreting caller strings as enum values. */
export class MessageSigningPolicies implements MessageSigningPolicy {
  readonly #policies: readonly MessageSigningPolicy[];

  constructor(policies: readonly MessageSigningPolicy[]) {
    this.#policies = [...policies];
  }
  /** The first coin policy that owns this result supplies its default. */
  format(resultId: string): MessageSigningFormat | null {
    for (const policy of this.#policies) {
      const format = policy.format(resultId);
      if (format !== null) return format;
    }
    return null;
  }
  /** An unknown selection has no display label. */
  label(format: unknown): string {
    for (const policy of this.#policies) {
      const label = policy.label(format);
      if (label !== "") return label;
    }
    return "";
  }
  /** Whether this result's owner offers the optional compact legacy format. */
  allowsLegacyChoice(resultId: string): boolean {
    return this.#policies.some((policy) => policy.allowsLegacyChoice(resultId));
  }
  /** Only the policy owning the active result admits a selection. */
  choose(resultId: string, selection: unknown): MessageSigningFormat | null {
    return (
      this.#policies
        .find((policy) => policy.format(resultId) !== null)
        ?.choose(resultId, selection) ?? null
    );
  }
}

/** Compatibility composition entry for the edition's selected coin policies. */
export function combineMessageSigningPolicies(
  ...policies: readonly MessageSigningPolicy[]
): MessageSigningPolicy {
  return new MessageSigningPolicies(policies);
}
