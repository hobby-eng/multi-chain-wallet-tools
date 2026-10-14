import type { CompactMessageParameters } from "./compact-message-internal.js";
import { getDashNetwork } from "./networks.js";
import type { NetworkName } from "./types.js";

/** The Dash Core message domain and address profile, shared by both signer entry points. */
export class DashCompactMessageProfile {
  static parameters(network: NetworkName): CompactMessageParameters {
    return {
      magic: "DarkCoin Signed Message:\n",
      p2pkhPrefix: getDashNetwork(network).p2pkh,
      format: "Dash Core compact P2PKH",
    };
  }
}
