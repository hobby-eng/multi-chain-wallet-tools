import { describe, expect, it } from "vitest";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { fingerprintWithoutPassphrase } from "../src/fingerprint.js";

describe("phrase fingerprint", () => {
  it("gives the BIP32 master fingerprint for an empty passphrase and wipes the seed", () => {
    let seed: Uint8Array | undefined;
    const fingerprint = fingerprintWithoutPassphrase(
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
      (mnemonic, passphrase) => (seed = mnemonicToSeed(mnemonic, passphrase)),
    );
    // The public BIP39 test phrase; its master fingerprint appears in BIP84 and many wallets.
    expect(fingerprint).toBe("73c5da0a");
    expect(seed?.every((byte) => byte === 0)).toBe(true);
  });
});
