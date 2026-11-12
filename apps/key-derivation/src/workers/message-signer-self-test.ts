// What the message-signing known answers of every coin share: the signer and verifier that the
// build composed, the public test key and the message they sign. Each coin's vector lives in its
// own module (message-signer-self-test-<coin>.ts), built only with its coin, so that a build
// carries none of another coin's vectors.
import type { MessageSigningRequest } from "@ckd/coins/message-signing.js";
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import { hexToBytes } from "@ckd/core/crypto.js";
import { expectEqual, now } from "../../../../packages/verification/src/helpers.js";
import type { FeatureFunctions } from "./worker-runtime.js";

/** The message that the compact-signature vectors sign. */
export const SIGNING_SELF_TEST_MESSAGE = "Offline message signing self-test";

/** The private key 1, a public test key, in hex. */
export function signingSelfTestKeyHex(): string {
  return "01".padStart(64, "0");
}

/** The private key 1, as the signer borrows it. */
export function signingSelfTestKey(): Uint8Array {
  return hexToBytes(signingSelfTestKeyHex());
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

/** A known answer: a public key (hex), the request it signs and the signature it must give. */
export interface SignedAnswer {
  readonly key: string;
  readonly request: MessageSigningRequest;
  readonly signature: string;
}

/**
 * A verify-only vector: the composed verifier must answer `expected`, true or false, or refuse the
 * signature with the code `expected` names.
 */
export interface VerifiedAnswer {
  readonly request: MessageSigningRequest;
  readonly signature: string;
  readonly expected: boolean | string;
}

/** The verifier's answer as text: "true", "false", or the code of its refusal. */
async function answerOf(
  verify: ReturnType<typeof messageVerifierOf>,
  request: MessageSigningRequest,
  signature: string,
): Promise<string> {
  try {
    return String(await verify(request, signature));
  } catch (cause) {
    // A refusal is an answer here; one without a code fails the comparison.
    return typeof cause === "object" && cause !== null && "code" in cause
      ? String(cause.code)
      : "an uncoded failure";
  }
}

/**
 * Checks each answer through the build's own signer and verifier: the exact signature, its local
 * verification, the verifier's acceptance, and its refusal of the same signature for another
 * message (CORE-28). `name` names the check in a failure, such as "Litecoin compact message".
 */
export async function checkSignedAnswers(
  features: FeatureFunctions,
  name: string,
  answers: readonly SignedAnswer[],
): Promise<CryptoSelfTestReport> {
  const started = now();
  const sign = messageSignerOf(features);
  const verify = messageVerifierOf(features);
  for (const { key, request, signature } of answers) {
    const signed = await sign(hexToBytes(key), request, []);
    expectEqual(`${name} signature`, signed.signature, signature);
    expectEqual(`${name} verification`, String(signed.verified), "true");
    expectEqual(`${name} verifier`, String(await verify(request, signature)), "true");
    const other = { ...request, message: `${request.message}!` };
    expectEqual(
      `${name} refusal of another message`,
      String(await verify(other, signature)),
      "false",
    );
  }
  return { passed: true, checks: [`${name} signature`], durationMs: Math.round(now() - started) };
}

/**
 * Checks published verify-only vectors through the build's verifier, in the full self-test; a
 * signature that must verify must also be refused for another message (CORE-28).
 */
export async function checkVerifiedAnswers(
  features: FeatureFunctions,
  name: string,
  answers: readonly VerifiedAnswer[],
): Promise<CryptoSelfTestReport> {
  const started = now();
  const verify = messageVerifierOf(features);
  for (const { request, signature, expected } of answers) {
    expectEqual(`${name} vector`, await answerOf(verify, request, signature), String(expected));
    if (expected !== true) continue;
    const other = { ...request, message: `${request.message}!` };
    expectEqual(`${name} vector refusal`, await answerOf(verify, other, signature), "false");
  }
  return { passed: true, checks: [`${name} vectors`], durationMs: Math.round(now() - started) };
}
