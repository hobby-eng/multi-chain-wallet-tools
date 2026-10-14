// XRP: Bitcoin's legacy address, the HASH160 of the key after version byte 0, written in the XRP
// Ledger's own Base58 alphabet.
//
// Host-neutral: it imports only base58.ts and @scure/base (test/portable-modules.test.ts).

import { base58xrp } from "@scure/base";
import { Base58Coin } from "./base58.js";

export const XRP = new Base58Coin({
  id: "xrp",
  name: "XRP",
  addressForms: "r…",
  coinTypes: [144],
  versions: [{ prefix: [0x00], type: "p2pkh", testnet: false }],
  alphabet: base58xrp,
});
