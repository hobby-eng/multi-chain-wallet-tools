import { signCompactMessage, verifyCompactMessage } from "./compact-message-internal.js";
import type {
  CompactMessageParameters,
  CompactMessageSignature,
} from "./compact-message-internal.js";
import type { NetworkName } from "./types.js";
import { DashCompactMessageProfile } from "./compact-message-dash-profile.js";
import { getBitcoinAddressFacts } from "./bitcoin-address-facts.js";

type CompactMessageChain = "bitcoin" | "dash";
export type { CompactMessageSignature } from "./compact-message-internal.js";

function parameters(chain: CompactMessageChain, network: NetworkName): CompactMessageParameters {
  if (chain === "bitcoin") {
    return {
      magic: "Bitcoin Signed Message:\n",
      p2pkhPrefix: getBitcoinAddressFacts(network).p2pkh,
      format: "Bitcoin compact P2PKH (BIP137)",
    };
  }
  return DashCompactMessageProfile.parameters(network);
}

export function signCompactP2pkhMessage(
  privateKey: Uint8Array,
  address: string,
  message: string,
  chain: CompactMessageChain,
  network: NetworkName,
): CompactMessageSignature {
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
