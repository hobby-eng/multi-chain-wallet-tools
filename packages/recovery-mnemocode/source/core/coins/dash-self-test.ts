// The self-test of Dash's addresses (dash.ts), Core and Platform, for a host that builds in Dash:
// the Dash edition of the Deriver alone, the others through core/coins-self-test.ts. The vectors'
// sources are in coin-self-test.ts.
//
// Host-neutral: it imports only dash.ts and coin-self-test.ts.

import { coinFamilySelfTest } from "./coin-self-test.js";
import { DASH } from "./dash.js";

/** The checks of Dash's addresses. */
export const DASH_ADDRESS_SELF_TEST = coinFamilySelfTest({
  name: "Dash addresses",
  vectors: [
    {
      coin: DASH,
      passphrase: "",
      path: "m/44'/5'/0'/0/0",
      address: "XoJA8qE3N2Y3jMLEtZ3vcN42qseZ8LvFf5",
    },
    {
      coin: DASH,
      passphrase: "",
      path: "m/44'/5'/3'/1/7",
      address: "XbAei18dD6mdL9LR6sTmbFJTQAJBcpxuxL",
    },
    // DIP17/DIP18: receiving key class 0', and change key class 1'.
    {
      coin: DASH,
      passphrase: "",
      path: "m/9'/5'/17'/0'/0'/0",
      address: "dash1krma5z3ttj75la4m93xcndna9ullamq9y5e9n5rs",
    },
    {
      coin: DASH,
      passphrase: "",
      path: "m/9'/5'/17'/0'/0'/1",
      address: "dash1kzjl7qzxy9lar37j8r37z3kvt07epqe20ckxfezw",
    },
    {
      coin: DASH,
      passphrase: "",
      path: "m/9'/5'/17'/0'/1'/0",
      address: "dash1kpkeye606ez89g7lelp7hnldwwpt76va0v3j6x28",
    },
  ],
  startup: [2],
  elsewhere: 1,
  scanned: 3,
  refused: [
    // The DIP18 vector with its last character changed.
    {
      coin: DASH,
      address: "dash1krma5z3ttj75la4m93xcndna9ullamq9y5e9n5rt",
      because: /checksum or format/u,
    },
  ],
});
