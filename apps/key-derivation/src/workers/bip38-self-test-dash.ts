// The BIP38 encryption known answer of a Dash key for the full self-test, encrypted with the
// encrypter that the build composed. It was computed with an independent implementation
// (node:crypto scrypt and AES-256-ECB) that reproduces BIP38's official vector.
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import { now } from "../../../../packages/verification/src/helpers.js";
import { expectBip38 } from "./bip38-self-test.js";
import type { FeatureFunctions } from "./worker-runtime.js";

export async function runDashBip38FullSelfTest(
  features: FeatureFunctions,
): Promise<CryptoSelfTestReport> {
  const started = now();
  await expectBip38(
    features,
    "BIP38 Dash",
    "dash-core",
    "6PYMfcjoDw2h66ho6AkKVzv9tQVv5dbeBG4mUQEaTzVQtJ2A2Ts4Sn4BpH",
  );
  return {
    passed: true,
    checks: ["BIP38 Dash encryption vector"],
    durationMs: Math.round(now() - started),
  };
}
