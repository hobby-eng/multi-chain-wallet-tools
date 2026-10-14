import { signCompactMessage } from "./compact-message-internal.js";
import type { CompactMessageSignature } from "./compact-message-internal.js";
import type { NetworkName } from "./types.js";
import { DashCompactMessageProfile } from "./compact-message-dash-profile.js";

export function signDashCompactP2pkhMessage(
  privateKey: Uint8Array,
  address: string,
  message: string,
  network: NetworkName,
): CompactMessageSignature {
  return signCompactMessage(
    privateKey,
    address,
    message,
    DashCompactMessageProfile.parameters(network),
  );
}
