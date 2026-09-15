import type { MessageSigningPolicy } from './message-signing-policy.js';

const DASH_SIGNABLE_RESULTS = new Set(['dash-core', 'dash-legacy-mobile', 'dash-core-coinjoin']);

export const DASH_MESSAGE_SIGNING_POLICY: MessageSigningPolicy = {
  format: (resultId) => (DASH_SIGNABLE_RESULTS.has(resultId) ? 'dash-compact' : null),
  label: (format) => (format === 'dash-compact' ? 'Dash Core compact P2PKH' : ''),
  allowsLegacyChoice: () => false,
};
