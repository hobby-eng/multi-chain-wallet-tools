// Bitcoin Cash's message signing: Bitcoin's compact signature and magic, as Bitcoin Cash Node,
// Electron Cash and Trezor write it. A signature proves the key's CashAddr and its legacy form,
// and is also a valid Bitcoin signature for that legacy address.
import { compactCoinSigning } from "../message-signing-compact.js";
import { BITCOIN_CASH_KEYS } from "./index.js";
import { BITCOIN_CASH_PROFILES } from "./profiles.js";

/** Bitcoin Cash's one format, for both of its coin types. */
export const BITCOIN_CASH_MESSAGE_SIGNING = compactCoinSigning({
  magic: "Bitcoin Signed Message:\n",
  headers: "core",
  keys: (type) => (type === "p2pkh" ? BITCOIN_CASH_KEYS : undefined),
  otherForms: ["legacyAddress"],
  // Every row of the coin has a P2PKH address, the one type its format signs.
  adapters: () => BITCOIN_CASH_PROFILES.map((profile) => profile.adapterId),
  formats: {
    "bitcoin-cash-compact": { name: "Bitcoin signmessage (Bitcoin Cash)", signingType: "p2pkh" },
  },
});
