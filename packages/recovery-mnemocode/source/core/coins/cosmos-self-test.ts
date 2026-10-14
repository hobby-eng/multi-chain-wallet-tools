// The self-test of the addresses of Cosmos and Injective (cosmos.ts), for a host that builds them
// in, through core/coins-self-test.ts. The vectors' sources are in coin-self-test.ts.
//
// Host-neutral: it imports only cosmos.ts and coin-self-test.ts.

import { coinFamilySelfTest } from "./coin-self-test.js";
import { COSMOS, INJECTIVE } from "./cosmos.js";

/** The checks of the addresses of Cosmos and Injective. */
export const COSMOS_ADDRESS_SELF_TEST = coinFamilySelfTest({
  name: "Cosmos and Injective addresses",
  vectors: [
    {
      coin: COSMOS,
      passphrase: "",
      path: "m/44'/118'/0'/0/0",
      address: "cosmos19rl4cm2hmr8afy4kldpxz3fka4jguq0auqdal4",
    },
    {
      coin: COSMOS,
      passphrase: "",
      path: "m/44'/118'/3'/1/7",
      address: "cosmos1j8dc8g9sux68h924yj646shrsjmkd7g6fwevky",
    },
    {
      coin: INJECTIVE,
      passphrase: "",
      path: "m/44'/60'/0'/0/0",
      address: "inj1npvwllfr9dqr8erajqqr6s0vxnk2ak55re90dz",
    },
  ],
  // One vector of each coin.
  startup: [0, 2],
  elsewhere: 1,
  refused: [
    {
      coin: COSMOS,
      address: "cosmos19rl4cm2hmr8afy4kldpxz3fka4jguq0auqdal5",
      because: /checksum or format/u,
    },
  ],
});
