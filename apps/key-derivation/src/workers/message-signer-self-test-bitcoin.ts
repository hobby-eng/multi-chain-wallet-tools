// Known answers of Bitcoin message signing, checked with the signer that the build composed before
// the page signs anything. The compact P2PKH signature of the public test key 1 was computed with
// ethers' SigningKey (RFC 6979), which shares @noble/curves with this tool, and reproduced with
// OpenSSL and plain BigInt arithmetic by AUD-023's independent harness
// (docs/audits/AUD-023-harnesses/selftests-independent-vectors.mjs). BIP-322 is checked with the
// specification's own "Hello World" vector: its signature must verify, and the page's signature of
// the same message, pinned here, must come out and verify too. The two differ only in their nonce:
// Bitcoin Core grinds for a low R and the signer used here does not; both are valid. Compact
// signing is quick, so it runs at startup; BIP-322 loads its own library, so it runs in the full
// self-test only.
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import { expectEqual, now } from "../../../../packages/verification/src/helpers.js";
import { verifyBip322Message } from "./bip322-signer.js";
import {
  messageSignerOf,
  signingSelfTestKey,
  SIGNING_SELF_TEST_MESSAGE,
} from "./message-signer-self-test.js";
import type { FeatureFunctions } from "./worker-runtime.js";

const COMPACT = {
  address: "1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH",
  signature:
    "H3fcO9sr+K04dbegeXN7uU1PRgo538UFG5eawYMXK8ZxfE8LegyeCj3CKIR87lMZ0xaktP65In3kejkdZhi8da8=",
};

/** BIP-322's test key, address and "Hello World" simple signature (bip-0322.mediawiki). */
const BIP322 = {
  key: "bb051cd0dda0246f33c5a9e133ebd8e7bc02a92af6c41adc131ccd7826c5b004",
  address: "bc1q9vza2e8x573nczrlzms0wvx3gsqjx7vavgkx0l",
  scriptPubKey: "00142b05d564e6a7a33c087f16e0f730d1440123799d",
  signature:
    "smpAkcwRAIgZRfIY3p7/DoVTty6YZbWS71bc5Vct9p9Fia83eRmw2QCICK/ENGfwLtptFluMGs2KsqoNSk89pO7F29zJLUx9a/sASECx/EgAxlkQpQ9hYjgGu6EBCPMVPwVIVJqO4XCsMvViHI=",
  /** The page's own RFC 6979 signature of the same message, without low-R grinding. */
  pageSignature:
    "smpAkgwRQIhAOzyynlqt93lOKJr+wmmxIens//zPzl9tqIOua93wO6MAiBi5n5EyAcPScOjf1lAqIUIQtr3zKNeavYabHyR8eGhowEhAsfxIAMZZEKUPYWI4BruhAQjzFT8FSFSajuFwrDL1Yhy",
};

export async function runBitcoinMessageSigningSelfTest(
  features: FeatureFunctions,
): Promise<CryptoSelfTestReport> {
  const started = now();
  const sign = messageSignerOf(features);
  const signed = await sign(
    signingSelfTestKey(),
    COMPACT.address,
    SIGNING_SELF_TEST_MESSAGE,
    "mainnet",
    "bitcoin-compact",
    [],
  );
  expectEqual("Bitcoin compact message signature", signed.signature, COMPACT.signature);
  expectEqual("Bitcoin compact message verification", String(signed.verified), "true");
  return {
    passed: true,
    checks: ["Bitcoin compact message signature"],
    durationMs: Math.round(now() - started),
  };
}

export async function runBip322FullSelfTest(
  features: FeatureFunctions,
): Promise<CryptoSelfTestReport> {
  const started = now();
  const sign = messageSignerOf(features);
  const signed = await sign(
    BIP322.key,
    BIP322.address,
    "Hello World",
    "mainnet",
    "bitcoin-bip322-native",
    [{ key: "scriptPubKey", label: "scriptPubKey", value: BIP322.scriptPubKey, secret: false }],
  );
  expectEqual("BIP-322 simple signature", signed.signature, BIP322.pageSignature);
  const verifies = (message: string, signature: string) =>
    verifyBip322Message(message, BIP322.address, signature, "mainnet");
  expectEqual(
    "BIP-322 specification vector",
    String(await verifies("Hello World", BIP322.signature)),
    "true",
  );
  // The check must also refuse: the same signature of another message is not valid.
  expectEqual(
    "BIP-322 refusal of another message",
    String(await verifies("Hello World!", BIP322.signature)),
    "false",
  );
  return {
    passed: true,
    checks: ["BIP-322 simple signature vector"],
    durationMs: Math.round(now() - started),
  };
}
