import {
  p2pkhCompactParameters,
  type CompactMessageParameters,
} from "./compact-message-internal.js";
import { getDashNetwork } from "./networks.js";
import type { NetworkName } from "./types.js";

/** The Dash Core message domain and address profile, shared by both signer entry points. */
export class DashCompactMessageProfile {
  static parameters(network: NetworkName): CompactMessageParameters {
    return p2pkhCompactParameters(
      "DarkCoin Signed Message:\n",
      getDashNetwork(network).p2pkh,
      "Dash Core compact P2PKH",
    );
  }
}
