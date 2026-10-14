import { DASH_ADDRESS_FAMILIES } from "@ckd/coins/dash/address-families.js";
import type { MessageSigningPolicy } from "./message-signing-policy.js";

export const DASH_MESSAGE_SIGNING_POLICY: MessageSigningPolicy = {
  format: (resultId) => (DASH_ADDRESS_FAMILIES.signsCompact(resultId) ? "dash-compact" : null),
  label: (format) => (format === "dash-compact" ? "Dash Core compact P2PKH" : ""),
  allowsLegacyChoice: () => false,
};
