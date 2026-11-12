import {
  p2pkhCompactParameters,
  signCompactMessage,
  verifyCompactMessage,
  type CompactMessageParameters,
} from "./compact-message-internal.js";
import type { MessageSignature } from "./message-signature.js";
import type { NetworkName } from "./types.js";
import { DashCompactMessageProfile } from "./compact-message-dash-profile.js";
import { getBitcoinAddressFacts } from "./bitcoin-address-facts.js";

type CompactMessageChain = "bitcoin" | "dash";

function parameters(chain: CompactMessageChain, network: NetworkName): CompactMessageParameters {
  if (chain === "bitcoin")
    return p2pkhCompactParameters(
      "Bitcoin Signed Message:\n",
      getBitcoinAddressFacts(network).p2pkh,
      "Bitcoin compact P2PKH (BIP137)",
    );
  return DashCompactMessageProfile.parameters(network);
}

export function signCompactP2pkhMessage(
  privateKey: Uint8Array,
  address: string,
  message: string,
  chain: CompactMessageChain,
  network: NetworkName,
): MessageSignature {
  return signCompactMessage(privateKey, address, message, parameters(chain, network));
}

export function verifyCompactP2pkhMessage(
  address: string,
  message: string,
  signature: string,
  chain: CompactMessageChain,
  network: NetworkName,
): boolean {
  return verifyCompactMessage(address, message, signature, parameters(chain, network));
}
