// The self-test of Ethereum's addresses (ethereum.ts) alone, for a host that builds in Ethereum
// without Ethereum Classic and Tron: it carries neither their vectors nor their names.
// evm-self-test.ts adds the other two. The vectors' sources are in coin-self-test.ts.
//
// Host-neutral: it imports only ethereum.ts and coin-self-test.ts.

import { coinFamilySelfTest } from "./coin-self-test.js";
import { ETHEREUM } from "./ethereum.js";

/** The checks of Ethereum's addresses. */
export const ETHEREUM_ADDRESS_SELF_TEST = coinFamilySelfTest({
  name: "Ethereum addresses",
  vectors: [
    {
      coin: ETHEREUM,
      passphrase: "",
      path: "m/44'/60'/0'/0/0",
      address: "0x9858EfFD232B4033E47d90003D41EC34EcaEda94",
    },
    {
      coin: ETHEREUM,
      passphrase: "",
      path: "m/44'/60'/3'/1/7",
      address: "0xc1A30611797762aea209daC2aC7E900f0cE95f9e",
    },
  ],
  startup: [0],
  elsewhere: 1,
  refused: [
    // The EIP-55 vector with one letter's case changed.
    {
      coin: ETHEREUM,
      address: "0x9858efFD232B4033E47d90003D41EC34EcaEda94",
      because: /EIP-55 checksum/u,
    },
  ],
});
