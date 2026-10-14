// The BIP38 encryption known answer of a Bitcoin key for the full self-test: BIP38's official
// second compressed vector, encrypted with the encrypter that the build composed.
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import { now } from "../../../../packages/verification/src/helpers.js";
import { expectBip38 } from "./bip38-self-test.js";
import type { FeatureFunctions } from "./worker-runtime.js";

export async function runBitcoinBip38FullSelfTest(
  features: FeatureFunctions,
): Promise<CryptoSelfTestReport> {
  const started = now();
  await expectBip38(
    features,
    "BIP38 Bitcoin",
    "bitcoin-legacy",
    "6PYLtMnXvfG3oJde97zRyLYFZCYizPU5T3LwgdYJz1fRhh16bU7u6PPmY7",
  );
  return {
    passed: true,
    checks: ["BIP38 Bitcoin encryption vector"],
    durationMs: Math.round(now() - started),
  };
}
