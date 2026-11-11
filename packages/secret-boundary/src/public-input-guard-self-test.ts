// The known answers of the public-input guard, checked at startup before any lookup can be sent:
// secret material is refused and public values pass. All are public test values: BIP39's
// "abandon … about", the WIF of the private key 1, BIP32's first test-vector master key, and the
// Deriver's forms of "abandon … about"'s first keys: Solana's base58 keypair, NEAR's "ed25519:"
// secret key, Stellar's secret seed, the XRP Ledger family seed of 16 zero bytes (that phrase's
// entropy), Hedera's DER private key and TON's 64-byte secret key in hex. The samples carry no coin
// name, since the guard ships in the Dash Community edition.
import { assertPublicLookupInput } from "./public-input-guard.js";

const SECRET_SAMPLES: readonly [string, string][] = [
  [
    "a BIP39 phrase",
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
  ],
  ["a WIF private key", "XBHddvWWiMu3nZhhpTXBQWJMmdz5JNKJD85b9fgKAckCT2coW3Y4"],
  [
    "an extended private key",
    "xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi",
  ],
  [
    "an Ed25519 keypair in base58",
    "27npWoNE4HfmLeQo1TyWcW7NEA28qnsnDK7kcttDQEWrCWnro83HMJ97rMmpvYYZRwDAvG4KRuB7hTBacvwD7bgi",
  ],
  [
    "an ed25519: secret key",
    "ed25519:F1kPR175szkGxEL52A9H6Z5ocS2BtaipprK2Hiob9DjGzHTkScrBb1yt44baXPZ3LxyHcsTPdBjHmn6zx147txH",
  ],
  ["a StrKey secret seed", "SBUV3MRWKNS6AYKZ6E6MOUVF2OYMON3MIUASWL3JLY5E3ISDJFELYBRZ"],
  ["a family seed", "sp6JS7f14BuwFY8Mw6bTtLKWauoUs"],
  [
    "a private key in DER",
    "302e020100300506032b657004220420523f9ff611ac02e8e188617750e7e50feabd2ef9ee9b218a5c8ce2693275361d",
  ],
  [
    "an Ed25519 keypair in hex",
    "b477ef5ed17fb8a2b8faddd7a9835a227243a82c70b190c7af4896155aa7df9f7952e94118f34607c75e23258dd9220d66ccac5a3ee074125c25068e8107bfbf",
  ],
];
/**
 * Public values, which must pass: a Dash address; the public counterparts of the keys above (the
 * Solana address, the NEAR public key, the Stellar account ID, the Hedera public key in DER, the
 * TON raw address); Tron and Dash addresses that start with an extended private key's letters in
 * another case; and 64 bytes in hex that are not a keypair, the first Ethereum key's public point,
 * as Dash's 64-byte Orchard viewing keys are not.
 */
const PUBLIC_SAMPLES = [
  "XoJA8qE3N2Y3jMLEtZ3vcN42qseZ8LvFf5",
  "HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk",
  "ed25519:6j4b6zUaty6fD1awqcGCCU9JYGCWYUgdJhQrzfZhqE25",
  "GB3JDWCQJCWMJ3IILWIGDTQJJC5567PGVEVXSCVPEQOTDN64VJBDQBYX",
  "302a300506032b657003210010fcec8c5db29aeab62272a08be39b1ec75eba50624351fba9948ff5d3d78ecf",
  "0:335996ba9cce6625ebfdd7019ced50927c1a08b1846a289a55efc37c01d77df9",
  "TPRVtcLaaiBQHd6Fsc34PDoCWnqDGBimp6",
  "XprVT2gUJdj9uXoFGRktsv6eGqsd15pT4a",
  "37b0bb7a8288d38ed49a524b5dc98cff3eb5ca824c9f9dc0dfdb3d9cd600f299a6179912b7451c09896c4098eca7ce6b2e58330672795e847c4d6af44e024230",
] as const;

/** The checks' names; throws when the guard lets a secret through or refuses a public value. */
export function runPublicInputGuardSelfTest(): readonly string[] {
  for (const [kind, sample] of SECRET_SAMPLES) {
    let refused = false;
    try {
      assertPublicLookupInput(sample);
    } catch {
      refused = true;
    }
    if (!refused) throw new Error(`Self-test failed: the public-input guard let ${kind} through.`);
  }
  for (const [at, sample] of PUBLIC_SAMPLES.entries()) {
    try {
      assertPublicLookupInput(sample);
    } catch (cause) {
      throw new Error(`Self-test failed: the public-input guard refused public value ${at + 1}.`, {
        cause,
      });
    }
  }
  return [
    "Public-input guard refuses phrases, WIF, extended private keys, Ed25519 secret keys, DER private keys and secret seeds",
  ];
}
