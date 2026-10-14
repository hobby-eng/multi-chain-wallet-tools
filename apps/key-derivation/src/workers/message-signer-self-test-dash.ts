// The known answer of Dash compact message signing, checked with the signer that the build composed
// before the page signs anything: the signature of the public test key 1, computed with ethers'
// SigningKey (RFC 6979), which shares @noble/curves with this tool, and reproduced with OpenSSL and
// plain BigInt arithmetic by AUD-023's independent harness
// (docs/audits/AUD-023-harnesses/selftests-independent-vectors.mjs).
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import { expectEqual, now } from "../../../../packages/verification/src/helpers.js";
import {
  messageSignerOf,
  signingSelfTestKey,
  SIGNING_SELF_TEST_MESSAGE,
} from "./message-signer-self-test.js";
import type { FeatureFunctions } from "./worker-runtime.js";

const ADDRESS = "XmN7PQYWKn5MJFna5fRYgP6mxT2F7xpekE";
const SIGNATURE =
  "H5Oj4LXfIgqbHRLIbCGux6wQGf3ZtC8iQt79foa4M9nkadAXIRsCL4X8sJWAH9iwOpV5w6N8mS1jxrRp+8Nxapc=";

export async function runDashMessageSigningSelfTest(
  features: FeatureFunctions,
): Promise<CryptoSelfTestReport> {
  const started = now();
  const sign = messageSignerOf(features);
  const signed = await sign(
    signingSelfTestKey(),
    ADDRESS,
    SIGNING_SELF_TEST_MESSAGE,
    "mainnet",
    "dash-compact",
    [],
  );
  expectEqual("Dash compact message signature", signed.signature, SIGNATURE);
  expectEqual("Dash compact message verification", String(signed.verified), "true");
  return {
    passed: true,
    checks: ["Dash compact message signature"],
    durationMs: Math.round(now() - started),
  };
}
