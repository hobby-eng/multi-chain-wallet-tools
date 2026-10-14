// The known answers of the public-input guard, checked at startup before any lookup can be sent:
// secret material is refused (a BIP39 phrase, a WIF private key, an extended private key) and a
// public address passes. All are public test values: BIP39's "abandon … about", the WIF of the
// private key 1 and BIP32's first test-vector master key.
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
];
/** A public address, which must pass. */
const PUBLIC_SAMPLE = "XoJA8qE3N2Y3jMLEtZ3vcN42qseZ8LvFf5";

/** The checks' names; throws when the guard lets a secret through or refuses a public address. */
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
  assertPublicLookupInput(PUBLIC_SAMPLE);
  return ["Public-input guard refuses phrases, WIF and extended private keys"];
}
