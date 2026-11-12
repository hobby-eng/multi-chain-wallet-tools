// Dogecoin's message signing: Dogecoin Core's compact signature of its P2PKH addresses.
import { compactCoinSigning } from "../message-signing-compact.js";
import { DOGECOIN_KEYS } from "./index.js";
import { DOGECOIN_PROFILES } from "./profiles.js";

/** Dogecoin's one format, Dogecoin Core's signmessage. */
export const DOGECOIN_MESSAGE_SIGNING = compactCoinSigning({
  magic: "Dogecoin Signed Message:\n",
  headers: "core",
  keys: (type) => (type === "p2pkh" ? DOGECOIN_KEYS : undefined),
  adapters: DOGECOIN_PROFILES.map((profile) => profile.adapterId),
  formats: { "dogecoin-compact": { name: "Dogecoin Core signmessage", signingType: "p2pkh" } },
});
