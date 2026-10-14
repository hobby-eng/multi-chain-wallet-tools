// What the BIP38 known answers of every coin share: the encrypter that the build composed, and
// BIP38's test key with the passphrase of its second compressed vector. Each coin's vector lives
// in its own module (bip38-self-test-bitcoin.ts, bip38-self-test-dash.ts), built only with its
// coin. scrypt makes each check take a noticeable moment, so they run in the full self-test only.
import { hexToBytes } from "@ckd/core/crypto.js";
import { expectEqual } from "../../../../packages/verification/src/helpers.js";
import type { FeatureFunctions } from "./worker-runtime.js";

/** BIP38's test key and passphrase of the second compressed vector. */
const TEST_KEY = "09c2686880095b1a4c249ee3ac4eea8a014f11e6f986d0b5025ac1f39afbd9ae";
const PASSPHRASE = "Satoshi";

/** Encrypts the test key for `adapterId` with the build's encrypter and compares the result. */
export async function expectBip38(
  features: FeatureFunctions,
  check: string,
  adapterId: string,
  expected: string,
): Promise<void> {
  if (features.encryptDerivedP2pkhKey === undefined)
    throw new Error("Self-test failed: BIP38 encryption is not composed into this build.");
  const key = hexToBytes(TEST_KEY);
  try {
    const { encryptedKey } = await features.encryptDerivedP2pkhKey(
      key,
      adapterId,
      "mainnet",
      PASSPHRASE,
    );
    expectEqual(check, encryptedKey, expected);
  } finally {
    key.fill(0);
  }
}
