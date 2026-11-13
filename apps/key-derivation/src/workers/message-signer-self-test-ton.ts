// The known answers of TON message signing. No signData signature of a known key is published, so
// the startup answers are check/c_vectors.py's: RFC 8032's reference Ed25519, which first
// reproduces RFC 8032's TEST 1 to 3 and verifies near/intents' signatures, signs with TEST 1's seed
// for the domain self-test.example at 1700000000, a text payload for the key's W5 wallet and the
// same message's bytes as a binary payload for its v4R2 wallet. The full self-test verifies
// near/intents' wallet signatures (crates/signatures/ton-connect/src/lib.rs L184-L228 at fce0936b),
// whose address the script finds to be the v4R2 wallet of their key. Each valid signature is also
// refused for another message.
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import {
  checkSignedAnswers,
  checkVerifiedAnswers,
  ED25519_SELF_TEST_SEED,
  SIGNING_SELF_TEST_MESSAGE,
} from "./message-signer-self-test.js";
import type { FeatureFunctions } from "./worker-runtime.js";

const PUBLIC_KEY = "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";
const INPUTS = { domain: "self-test.example", timestamp: "1700000000", publicKey: PUBLIC_KEY };
/** The self-test message's bytes, which the binary payload signs. */
const MESSAGE_HEX = "4f66666c696e65206d657373616765207369676e696e672073656c662d74657374";
/** "!" as a byte, to change a binary payload as "!" changes a text one. */
const EXCLAMATION_HEX = "21";

export function runTonMessageSigningSelfTest(
  features: FeatureFunctions,
): Promise<CryptoSelfTestReport> {
  return checkSignedAnswers(features, "TON Connect signData message", [
    {
      key: ED25519_SELF_TEST_SEED,
      request: {
        format: "ton-sign-data-text",
        address: "UQCUp64SJJ505dIdcgHDG1oD8JKMLXpQzu5W6lLFdQGtA8kY",
        message: SIGNING_SELF_TEST_MESSAGE,
        network: "mainnet",
        inputs: INPUTS,
      },
      signature:
        '{"signature":"mZXkyg84ZQkiaEymJ5mDVL3S6yg7sjACReZIYyZlRFLcAe7czvHdPs05O6uDtTXqWX1mJlRadD3t7CtINmeNAg==","address":"0:94a7ae12249e74e5d21d7201c31b5a03f0928c2d7a50ceee56ea52c57501ad03","timestamp":1700000000,"domain":"self-test.example","payload":{"type":"text","text":"Offline message signing self-test"}}',
    },
    {
      key: ED25519_SELF_TEST_SEED,
      request: {
        format: "ton-sign-data-binary",
        address: "UQDNrJfJFisuFBrURjgosqcO_fh2K5foNWPzUr7PkC6Ipteq",
        message: MESSAGE_HEX,
        network: "mainnet",
        inputs: INPUTS,
      },
      signature:
        '{"signature":"xQZBdOr77lQz7BPvh/qTEnlnzdjnDwL1/0KmGvIg96OFwgiHLvwrHG0JmUeUAJgdopJUPQjgI0hS0M17QfN8Cg==","address":"0:cdac97c9162b2e141ad4463828b2a70efdf8762b97e83563f352becf902e88a6","timestamp":1700000000,"domain":"self-test.example","payload":{"type":"binary","bytes":"T2ZmbGluZSBtZXNzYWdlIHNpZ25pbmcgc2VsZi10ZXN0"}}',
      changed: `${MESSAGE_HEX}${EXCLAMATION_HEX}`,
    },
  ]);
}

/** near/intents' wallet, its key and the domain of both of its signatures. */
const NEAR_INTENTS = {
  address: "0:f4809e5ffac9dc42a6b1d94c5e74ad5fd86378de675c805f2274d0055cbc9378",
  network: "mainnet",
} as const;
const NEAR_INTENTS_INPUTS = {
  domain: "ton-connect.github.io",
  publicKey: "22e795a07e832fc9084ca35a488a711f1dbedef637d4e886a6997d93ee2c2e37",
};
const HELLO_TON_HEX = "48656c6c6f2c20544f4e21";

export function runTonMessageSigningFullSelfTest(
  features: FeatureFunctions,
): Promise<CryptoSelfTestReport> {
  return checkVerifiedAnswers(features, "TON Connect signData near/intents", [
    {
      request: {
        ...NEAR_INTENTS,
        format: "ton-sign-data-text",
        message: "Hello, TON!".repeat(100),
        inputs: { ...NEAR_INTENTS_INPUTS, timestamp: "1747759882" },
      },
      signature:
        "e8Yo9tY0q23a8QRjdCsT8O3jy4KHN9nOGWLMgI+/5wNed8Gj0LaCrPAtZFzBokSZKydlUsDhxX0wsDwoINc9AQ==",
      expected: true,
    },
    {
      request: {
        ...NEAR_INTENTS,
        format: "ton-sign-data-binary",
        message: HELLO_TON_HEX,
        inputs: { ...NEAR_INTENTS_INPUTS, timestamp: "1747760435" },
      },
      signature:
        "nPTBwWtHr85GlA65zUEIlPMVRLdCBsIlS7FlH5syz1sOSCt4ouglHlTTUX+uSwbG8jVGZn1j/2LczOcEUWmNAQ==",
      expected: true,
      changed: `${HELLO_TON_HEX}${EXCLAMATION_HEX}`,
    },
  ]);
}
