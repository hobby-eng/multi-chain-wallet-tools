// Zcash's message signing: zcashd's compact signature of transparent t1 addresses, which Zallet
// keeps; Zallet refuses the uncompressed headers 27–30. Shielded addresses have no such standard.
import { compactCoinSigning } from "../message-signing-compact.js";
import { ZCASH_KEYS } from "./index.js";

/** Zcash's one format, zcashd's and Zallet's signmessage. */
export const ZCASH_MESSAGE_SIGNING = compactCoinSigning({
  magic: "Zcash Signed Message:\n",
  headers: "compressed",
  keys: (type) => (type === "p2pkh" ? ZCASH_KEYS : undefined),
  formats: { "zcash-compact": { name: "Zcash signmessage (t1)", signingType: "p2pkh" } },
});
