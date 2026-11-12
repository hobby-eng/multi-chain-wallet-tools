import { signCompactMessage, verifyCompactMessage } from "./compact-message-internal.js";
import type { MessageSignature } from "./message-signature.js";
import type { NetworkName } from "./types.js";
import { DashCompactMessageProfile } from "./compact-message-dash-profile.js";

export function signDashCompactP2pkhMessage(
  privateKey: Uint8Array,
  address: string,
  message: string,
  network: NetworkName,
): MessageSignature {
  return signCompactMessage(
    privateKey,
    address,
    message,
    DashCompactMessageProfile.parameters(network),
  );
}

/**
 * Whether `signature` is Dash Core's compact signature of `message` by the key of the P2PKH
 * `address`; a malformed signature is refused with a CompactMessageError instead.
 */
export function verifyDashCompactP2pkhMessage(
  address: string,
  message: string,
  signature: string,
  network: NetworkName,
): boolean {
  return verifyCompactMessage(
    address,
    message,
    signature,
    DashCompactMessageProfile.parameters(network),
  );
}
