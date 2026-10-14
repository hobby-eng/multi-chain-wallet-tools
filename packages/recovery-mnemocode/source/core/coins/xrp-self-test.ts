// The self-test of the addresses of XRP (xrp.ts), for a host that builds them in, through
// core/coins-self-test.ts. The vectors' sources are in coin-self-test.ts.
//
// Host-neutral: it imports only xrp.ts and coin-self-test.ts.

import { coinFamilySelfTest } from "./coin-self-test.js";
import { XRP } from "./xrp.js";

/** The checks of the addresses of XRP. */
export const XRP_ADDRESS_SELF_TEST = coinFamilySelfTest({
  name: "XRP addresses",
  vectors: [
    {
      coin: XRP,
      passphrase: "",
      path: "m/44'/144'/0'/0/0",
      address: "rHsMGQEkVNJmpGWs8XUBoTBiAAbwxZN5v3",
    },
    {
      coin: XRP,
      passphrase: "",
      path: "m/44'/144'/3'/1/7",
      address: "rnU3BdqhZk8DL3FKjQcaAyf3DJSoUZD8eM",
    },
  ],
  startup: [0],
  elsewhere: 1,
  refused: [
    { coin: XRP, address: "rHsMGQEkVNJmpGWs8XUBoTBiAAbwxZN5v4", because: /checksum or format/u },
  ],
});
