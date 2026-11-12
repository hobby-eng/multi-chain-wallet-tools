// What the message-signing known answers of every coin share: the signer and verifier that the
// build composed, the public test key and the message they sign. Each coin's vector lives in its
// own module (message-signer-self-test-<coin>.ts), built only with its coin, so that a build
// carries none of another coin's vectors.
import type { FeatureFunctions } from "./worker-runtime.js";

/** The message that the compact-signature vectors sign. */
export const SIGNING_SELF_TEST_MESSAGE = "Offline message signing self-test";

/** The private key 1, a public test key, as the signer borrows it. */
export function signingSelfTestKey(): Uint8Array {
  const key = new Uint8Array(32);
  key[31] = 1;
  return key;
}

/** The build's signer; a build that runs these checks without one is composed wrongly. */
export function messageSignerOf(
  features: FeatureFunctions,
): NonNullable<FeatureFunctions["signDerivedMessage"]> {
  if (features.signDerivedMessage === undefined)
    throw new Error("Self-test failed: message signing is not composed into this build.");
  return features.signDerivedMessage;
}

/** The build's verifier, composed with its signer. */
export function messageVerifierOf(
  features: FeatureFunctions,
): NonNullable<FeatureFunctions["verifyDerivedMessage"]> {
  if (features.verifyDerivedMessage === undefined)
    throw new Error("Self-test failed: message verification is not composed into this build.");
  return features.verifyDerivedMessage;
}
