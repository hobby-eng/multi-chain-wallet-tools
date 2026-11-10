import { EVM_NETWORK_IDS } from "./evm-networks.mjs";
import { SINGLE_KEY_COIN_IDS } from "./single-key-coins.mjs";

const manifest = (coins, features) =>
  Object.freeze({ coins: Object.freeze(coins), features: Object.freeze(features) });

/**
 * Canonical command-line composition vocabulary. Builders, matrix planning and
 * option validation import these arrays instead of maintaining parallel lists.
 * Runtime graph assertions remain beside each application because they describe
 * implementation files rather than user-selectable capabilities.
 */
export const TOOL_MANIFESTS = Object.freeze({
  "key-derivation": manifest(
    ["bitcoin", "dash", "ethereum", ...SINGLE_KEY_COIN_IDS],
    [
      "derive",
      "bip85",
      "silent-payments",
      "bip38-encrypt",
      "message-signing",
      "wallet-matcher",
      "multisig",
      "seedqr",
      "mnemocode",
      "mnemocode-cards",
      "mhfe",
      "slip39",
      "codex32",
      "sskr",
      "gordian-envelope",
    ],
  ),
  // The connected tools also read the EVM networks of the EVM network table
  // (tooling/evm-networks.mjs).
  "activity-viewer": manifest(["bitcoin", "dash", "ethereum", ...EVM_NETWORK_IDS], []),
  "discovery-scanner": manifest(
    ["bitcoin", "dash", "ethereum", ...EVM_NETWORK_IDS],
    ["seed-discovery", "watch-only-discovery", "wallet-matcher", "custom-paths"],
  ),
  "psbt-inspector": manifest(
    ["bitcoin", "dash"],
    [
      "psbt-decoder",
      "script-decoder",
      "descriptor-decoder",
      "policy-builder",
      "multisig-wallet",
      "message-verification",
      "bip38-decrypt",
    ],
  ),
});
