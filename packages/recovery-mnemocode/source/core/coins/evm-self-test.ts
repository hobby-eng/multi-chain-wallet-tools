// The self-test of the addresses of Ethereum Classic and Tron (evm.ts), and of the three EVM coins
// together with Ethereum's (ethereum-self-test.ts), for a host that builds them in, through
// core/coins-self-test.ts. A host of Ethereum alone takes ethereum-self-test.ts instead. The
// vectors' sources are in coin-self-test.ts.
//
// Host-neutral: it imports only evm.ts, ethereum-self-test.ts, coin-self-test.ts and
// self-test-check.ts.

import { coinFamilySelfTest } from "./coin-self-test.js";
import { ETHEREUM_ADDRESS_SELF_TEST } from "./ethereum-self-test.js";
import { ETHEREUM_CLASSIC, TRON } from "./evm.js";
import { combinedFeature } from "../self-test-check.js";

/** The checks of the addresses of Ethereum Classic and Tron. */
export const ETHEREUM_CLASSIC_AND_TRON_ADDRESS_SELF_TEST = coinFamilySelfTest({
  name: "Ethereum Classic and Tron addresses",
  vectors: [
    {
      coin: ETHEREUM_CLASSIC,
      passphrase: "",
      path: "m/44'/61'/0'/0/0",
      address: "0xFA22515E43658ce56A7682B801e9B5456f511420",
    },
    // A wallet on the coin type of the chain it forked from, found on the second path.
    {
      coin: ETHEREUM_CLASSIC,
      passphrase: "",
      path: "m/44'/60'/0'/0/0",
      address: "0x9858EfFD232B4033E47d90003D41EC34EcaEda94",
    },
    {
      coin: TRON,
      passphrase: "",
      path: "m/44'/195'/0'/0/0",
      address: "TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH",
    },
    {
      coin: TRON,
      passphrase: "",
      path: "m/44'/195'/3'/1/7",
      address: "TTD7MudE8L26nvnrEf2LHzXm6stKRpFZH1",
    },
  ],
  // One vector of each coin.
  startup: [0, 2],
  elsewhere: 3,
  refused: [
    // Tron's first address with its last character changed: its Base58Check checksum fails.
    { coin: TRON, address: "TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdJ", because: /checksum or format/u },
  ],
});

/** The checks of the addresses of Ethereum, Ethereum Classic and Tron, as one row. */
export const EVM_ADDRESS_SELF_TEST = combinedFeature(
  "Ethereum, Ethereum Classic and Tron addresses",
  "Ethereum's, then Ethereum Classic's and Tron's: their addresses, another place, refusals",
  [ETHEREUM_ADDRESS_SELF_TEST, ETHEREUM_CLASSIC_AND_TRON_ADDRESS_SELF_TEST],
);
