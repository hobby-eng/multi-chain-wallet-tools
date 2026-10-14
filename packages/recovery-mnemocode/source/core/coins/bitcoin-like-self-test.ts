// The self-test of the addresses of Bitcoin, Litecoin, Dogecoin and Zcash (bitcoin-like.ts), for a
// host that builds them in, through core/coins-self-test.ts. The vectors' sources are in
// coin-self-test.ts.
//
// Host-neutral: it imports only bitcoin-like.ts, coin-self-test.ts and
// core/master-fingerprint-self-test.ts.

import { coinFamilySelfTest } from "./coin-self-test.js";
import { BITCOIN, DOGECOIN, LITECOIN, ZCASH } from "./bitcoin-like.js";
import { VECTOR_PASSPHRASE } from "../master-fingerprint-self-test.js";

/** The checks of the addresses of Bitcoin, Litecoin, Dogecoin and Zcash. */
export const BITCOIN_LIKE_ADDRESS_SELF_TEST = coinFamilySelfTest({
  name: "Bitcoin, Litecoin, Dogecoin and Zcash addresses",
  vectors: [
    {
      coin: BITCOIN,
      passphrase: "",
      path: "m/44'/0'/0'/0/0",
      address: "1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA",
    },
    {
      coin: BITCOIN,
      passphrase: "",
      path: "m/49'/0'/0'/0/0",
      address: "37VucYSaXLCAsxYyAPfbSi9eh4iEcbShgf",
    },
    {
      coin: BITCOIN,
      passphrase: "",
      path: "m/84'/0'/0'/0/0",
      address: "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu",
    },
    {
      coin: BITCOIN,
      passphrase: "",
      path: "m/84'/0'/0'/0/1",
      address: "bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g",
    },
    {
      coin: BITCOIN,
      passphrase: "",
      path: "m/84'/0'/0'/1/0",
      address: "bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el",
    },
    {
      coin: BITCOIN,
      passphrase: "",
      path: "m/86'/0'/0'/0/0",
      address: "bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr",
    },
    {
      coin: BITCOIN,
      passphrase: "",
      path: "m/86'/0'/0'/1/0",
      address: "bc1p3qkhfews2uk44qtvauqyr2ttdsw7svhkl9nkm9s9c3x4ax5h60wqwruhk7",
    },
    {
      coin: BITCOIN,
      passphrase: "",
      path: "m/44'/0'/3'/1/7",
      address: "12DCYXCcRpBJ5VoWDvSijepPu8mshEihvX",
    },
    {
      coin: BITCOIN,
      passphrase: "",
      path: "m/49'/0'/3'/1/7",
      address: "3K7gGbTWfdq3kyBgkVTMbhfftnrhxB6jpW",
    },
    {
      coin: BITCOIN,
      passphrase: "",
      path: "m/84'/0'/3'/1/7",
      address: "bc1q8r4wsa3nye5qypv80vpfg4sh99uf02u5mmh5ry",
    },
    {
      coin: BITCOIN,
      passphrase: "",
      path: "m/86'/0'/3'/1/7",
      address: "bc1preq6saz8z9zrn3clx9eaen0dcsynwseakek7nwqlrj52wd2dsfsqlfsyut",
    },
    {
      coin: BITCOIN,
      passphrase: "",
      path: "m/44'/1'/0'/0/0",
      address: "mkpZhYtJu2r87Js3pDiWJDmPte2NRZ8bJV",
    },
    {
      coin: BITCOIN,
      passphrase: "",
      path: "m/49'/1'/0'/0/0",
      address: "2Mww8dCYPUpKHofjgcXcBCEGmniw9CoaiD2",
    },
    {
      coin: BITCOIN,
      passphrase: "",
      path: "m/84'/1'/0'/0/0",
      address: "tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl",
    },
    {
      coin: BITCOIN,
      passphrase: "",
      path: "m/86'/1'/0'/0/0",
      address: "tb1p8wpt9v4frpf3tkn0srd97pksgsxc5hs52lafxwru9kgeephvs7rqlqt9zj",
    },
    {
      coin: BITCOIN,
      passphrase: VECTOR_PASSPHRASE,
      path: "m/84'/0'/0'/0/0",
      address: "bc1qv5rmq0kt9yz3pm36wvzct7p3x6mtgehjul0feu",
    },
    {
      coin: ZCASH,
      passphrase: "",
      path: "m/44'/133'/0'/0/0",
      address: "t1XVXWCvpMgBvUaed4XDqWtgQgJSu1Ghz7F",
    },
    {
      coin: ZCASH,
      passphrase: "",
      path: "m/44'/133'/3'/1/7",
      address: "t1Pii1UXFrpcFucY5NBEFa664pymr7boHq4",
    },
    {
      coin: DOGECOIN,
      passphrase: "",
      path: "m/44'/3'/0'/0/0",
      address: "DBus3bamQjgJULBJtYXpEzDWQRwF5iwxgC",
    },
    {
      coin: DOGECOIN,
      passphrase: "",
      path: "m/44'/3'/3'/1/7",
      address: "DNuJKZiVoQ6t67t8dE4NuBDhd2FNpMBsg6",
    },
    {
      coin: LITECOIN,
      passphrase: "",
      path: "m/44'/2'/0'/0/0",
      address: "LUWPbpM43E2p7ZSh8cyTBEkvpHmr3cB8Ez",
    },
    {
      coin: LITECOIN,
      passphrase: "",
      path: "m/49'/2'/0'/0/0",
      address: "M7wtsL7wSHDBJVMWWhtQfTMSYYkyooAAXM",
    },
    {
      coin: LITECOIN,
      passphrase: "",
      path: "m/84'/2'/3'/1/7",
      address: "ltc1qnnphcvq5zgyf4f0uepust6d7gyt2zl69vftnz2",
    },
  ],
  // One vector of each coin, and Taproot, whose tweak no other vector takes.
  startup: [20, 16, 18, 5],
  elsewhere: 7,
  scanned: 3,
  refused: [
    // BIP173's P2WSH example: a script, not a single key.
    {
      coin: BITCOIN,
      address: "bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3",
      because: /not the address of a single key; only bc1q with 42 characters or bc1p/u,
    },
    {
      coin: LITECOIN,
      address: "1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA",
      because: /not an address of Litecoin/u,
    },
  ],
});
