// What the message-signing known answers of every coin share: the signer that the build composed,
// the public test key and the message they sign. Each coin's vector lives in its own module
// (message-signer-self-test-bitcoin.ts, message-signer-self-test-dash.ts), built only with its
// coin, so that a build carries none of another coin's vectors.
import type { FeatureFunctions } from "./worker-runtime.js";

/** The message that the compact-signature vectors sign. */
export const SIGNING_SELF_TEST_MESSAGE = "Offline message signing self-test";

/** The private key 1, a public test key, as the signer takes it. */
export function signingSelfTestKey(): string {
  return "01".padStart(64, "0");
}

/** The build's signer; a build that runs these checks without one is composed wrongly. */
export function messageSignerOf(
  features: FeatureFunctions,
): NonNullable<FeatureFunctions["signDerivedMessage"]> {
  if (features.signDerivedMessage === undefined)
    throw new Error("Self-test failed: message signing is not composed into this build.");
  return features.signDerivedMessage;
}
