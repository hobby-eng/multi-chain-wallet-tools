import type { MessageSigningFormat } from '../workers/protocol.js';

export interface MessageSigningPolicy {
  format(resultId: string): MessageSigningFormat | null;
  label(format: MessageSigningFormat): string;
  allowsLegacyChoice(resultId: string): boolean;
}

export function combineMessageSigningPolicies(...policies: readonly MessageSigningPolicy[]): MessageSigningPolicy {
  return {
    format(resultId) {
      for (const policy of policies) {
        const format = policy.format(resultId);
        if (format !== null) return format;
      }
      return null;
    },
    label(format) {
      const owner = policies.find((policy) => policy.label(format) !== '');
      if (owner === undefined) throw new Error(`Unsupported message-signing format: ${format}.`);
      return owner.label(format);
    },
    allowsLegacyChoice(resultId) {
      return policies.some((policy) => policy.allowsLegacyChoice(resultId));
    },
  };
}
