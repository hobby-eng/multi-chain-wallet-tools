const manifest = (coins, features) => Object.freeze({ coins: Object.freeze(coins), features: Object.freeze(features) });

/**
 * Canonical command-line composition vocabulary. Builders, matrix planning and
 * option validation import these arrays instead of maintaining parallel lists.
 * Runtime graph assertions remain beside each application because they describe
 * implementation files rather than user-selectable capabilities.
 */
export const TOOL_MANIFESTS = Object.freeze({
  'key-derivation': manifest(
    ['bitcoin', 'dash', 'ethereum'],
    [
      'derive',
      'bip85',
      'silent-payments',
      'bip38-encrypt',
      'message-signing',
      'wallet-matcher',
      'seedqr',
      'slip39',
      'shamir',
      'codex32',
      'sskr',
      'gordian-envelope',
    ],
  ),
  'activity-viewer': manifest(['bitcoin', 'dash', 'ethereum'], []),
  'discovery-scanner': manifest(
    ['bitcoin', 'dash', 'ethereum'],
    ['seed-discovery', 'watch-only-discovery', 'wallet-matcher', 'custom-paths'],
  ),
  'psbt-inspector': manifest(
    ['bitcoin', 'dash'],
    [
      'psbt-decoder',
      'script-decoder',
      'descriptor-decoder',
      'policy-builder',
      'multisig-wallet',
      'message-verification',
      'bip38-decrypt',
    ],
  ),
});
