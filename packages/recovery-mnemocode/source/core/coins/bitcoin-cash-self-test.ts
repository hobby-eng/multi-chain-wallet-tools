// The self-test of the addresses of Bitcoin Cash (bitcoin-cash.ts), for a host that builds them in,
// through core/coins-self-test.ts. The vectors' sources are in coin-self-test.ts.
//
// Host-neutral: it imports only bitcoin-cash.ts and coin-self-test.ts.

import { coinFamilySelfTest } from "./coin-self-test.js";
import { BITCOIN_CASH } from "./bitcoin-cash.js";

/** The checks of the addresses of Bitcoin Cash. */
export const BITCOIN_CASH_ADDRESS_SELF_TEST = coinFamilySelfTest({
  name: "Bitcoin Cash addresses",
  vectors: [
    {
      coin: BITCOIN_CASH,
      passphrase: "",
      path: "m/44'/145'/0'/0/0",
      address: "bitcoincash:qqyx49mu0kkn9ftfj6hje6g2wfer34yfnq5tahq3q6",
    },
    {
      coin: BITCOIN_CASH,
      passphrase: "",
      path: "m/44'/145'/3'/1/7",
      address: "bitcoincash:qrhejavdmlfh9eajjxra3s3mn8gxls9hkvsq2yd62y",
    },
    {
      coin: BITCOIN_CASH,
      passphrase: "",
      path: "m/44'/145'/0'/0/0",
      address: "1mW6fDEMjKrDHvLvoEsaeLxSCzZBf3Bfg",
    },
    // A wallet on the coin type of the chain it forked from, found on the second path.
    {
      coin: BITCOIN_CASH,
      passphrase: "",
      path: "m/44'/0'/0'/0/0",
      address: "1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA",
    },
  ],
  startup: [0],
  elsewhere: 1,
  refused: [
    // A P2SH CashAddr: a script, not a single key.
    {
      coin: BITCOIN_CASH,
      address: "bitcoincash:pqkh9ahfj069qv8l6eysyufazpe4fdjq3u4hna323j",
      because: /not the address of a single key; only bitcoincash:q… or 1…/u,
    },
  ],
});
