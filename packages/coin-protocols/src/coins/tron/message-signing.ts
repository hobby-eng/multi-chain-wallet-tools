// Tron's message signing: TronWeb's signMessageV2, TIP-191's envelope with the name "TRON", as
// TronLink and the Ledger Tron app sign it. TronWeb's deprecated hex-only signMessage is not offered.
import { TRON_KEYS } from "./index.js";
import { secp256k1HexKey } from "@ckd/core/derived-private-key.js";
import { envelopeCoinSigning } from "../message-signing-envelope.js";
import { TRON_PROFILES } from "./profiles.js";

/** Tron's one format, for its T… addresses. */
export const TRON_MESSAGE_SIGNING = envelopeCoinSigning({
  envelope: "TRON",
  key: secp256k1HexKey("privateKey"),
  adapters: TRON_PROFILES.map((profile) => profile.adapterId),
  formats: { "tron-tip191": { name: "TIP-191 signMessageV2" } },
  addressOf: (publicKey) => TRON_KEYS.address(publicKey).address,
  addressesEqual: (derived, expected) => derived === expected,
  // TronWeb's verifyMessageV2 (ethers v6 Signature.from) refuses an s in the upper half.
  lowS: true,
});
