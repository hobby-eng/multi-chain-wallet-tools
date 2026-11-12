// Known answers of Litecoin message signing. At startup: Litecoin Core's published vector
// (test/functional/rpc_signmessage.py L20-L28 at ec1b6489), signed for the mainnet L… address of
// its key, and the same r‖s under BIP137's typed headers 35 and 39 for the key's SegWit addresses,
// our own answers computed with tmp check/a2_vectors.py, whose primitives reproduce Litecoin Core's
// vector first. In the full self-test: Electrum-LTC's verify-only vectors (electrum_ltc/tests/
// test_bitcoin.py L190-L245 at f9cbfaca): BIP137 headers 35 and 40, the same r‖s refused under
// headers 27 and 24, and Electrum's own untyped header 31 for both SegWit types.
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import {
  checkSignedAnswers,
  checkVerifiedAnswers,
  type SignedAnswer,
  type VerifiedAnswer,
} from "./message-signer-self-test.js";
import type { FeatureFunctions } from "./worker-runtime.js";

const KEY = "d2b8a0116d641fe7d3036f8464628fb595b480414c13a301b3d4038c811c28b0";
const MESSAGE = "This is just a test message";
const EXAMPLE = "This is an example of a signed message.";

const signed = (format: string, address: string, signature: string): SignedAnswer => ({
  key: KEY,
  request: { format, address, message: MESSAGE, network: "mainnet" },
  signature,
});
const verified = (
  format: string,
  address: string,
  message: string,
  signature: string,
  expected: boolean | string,
): VerifiedAnswer => ({
  request: { format, address, message, network: "mainnet" },
  signature,
  expected,
});

const SIGNED: readonly SignedAnswer[] = [
  signed(
    "litecoin-compact-legacy",
    "LU3QhpXxRDuzgBH2osX9xGaWi3ihkjGdKH",
    "IGve8AOjIcu+a/nYW1PABSfmp2oQlEqLIOwPgNW5/Y5teggr8S0vy4SMdjL2Viv3iuBZjJbhvyBo0tv5m3H63b8=",
  ),
  signed(
    "litecoin-compact-nested",
    "MDxzgdz1A29o9XF1nXi8wwLF1Ns1jgbZL3",
    "JGve8AOjIcu+a/nYW1PABSfmp2oQlEqLIOwPgNW5/Y5teggr8S0vy4SMdjL2Viv3iuBZjJbhvyBo0tv5m3H63b8=",
  ),
  signed(
    "litecoin-compact-native",
    "ltc1qvza2pay5kwxw8j2qm6n87wqym3fdr7u55fd9ep",
    "KGve8AOjIcu+a/nYW1PABSfmp2oQlEqLIOwPgNW5/Y5teggr8S0vy4SMdjL2Viv3iuBZjJbhvyBo0tv5m3H63b8=",
  ),
];

const NESTED = "MS2NsKymog9TrEVq4wbrjn1oYS7MiPDkqR";
const NATIVE = "ltc1qnw6a545d64e94r4vts80n89nmcpud5fdftvryq";
const ELECTRUM_SEGWIT =
  "H3nh1AqVvauwclOAPs2serBtro9Iei1Q7vZZfmivo6ioQ6EzNYq5No90CU5RXM17d05eO+bXd0p/r/Sl5fPz390=";

const VERIFIED: readonly VerifiedAnswer[] = [
  verified(
    "litecoin-compact-nested",
    NESTED,
    EXAMPLE,
    "I3RN5FFvrFwUCAgBVmRRajL+rZTeiXdc7H4k28JP4TMHWsCTAcTMjhl76ktkgWYdW46b8Z2Le4o4Ls21PC7gdQ0=",
    true,
  ),
  verified(
    "litecoin-compact-nested",
    NESTED,
    EXAMPLE,
    "G3RN5FFvrFwUCAgBVmRRajL+rZTeiXdc7H4k28JP4TMHWsCTAcTMjhl76ktkgWYdW46b8Z2Le4o4Ls21PC7gdQ0=",
    false,
  ),
  verified(
    "litecoin-compact-native",
    NATIVE,
    EXAMPLE,
    "KLVddgDZ6afipJFV3fPP2455bCB/qrgzAQ+kH7eCiIm8R89iNIp6qgkjwIMqWJ+rVB6PEutU+3EckOIwfw9msZQ=",
    true,
  ),
  verified(
    "litecoin-compact-native",
    NATIVE,
    EXAMPLE,
    "GLVddgDZ6afipJFV3fPP2455bCB/qrgzAQ+kH7eCiIm8R89iNIp6qgkjwIMqWJ+rVB6PEutU+3EckOIwfw9msZQ=",
    "INVALID_HEADER",
  ),
  verified(
    "litecoin-compact-nested",
    "MKkwVip3KDUb2WFJqr8bGebGPHNAXwGG1f",
    "Electrum",
    ELECTRUM_SEGWIT,
    true,
  ),
  verified(
    "litecoin-compact-native",
    "ltc1qq2tmmcngng78nllq2pvrkchcdukemtj57q7cpl",
    "Electrum",
    ELECTRUM_SEGWIT,
    true,
  ),
];

export function runLitecoinMessageSigningSelfTest(
  features: FeatureFunctions,
): Promise<CryptoSelfTestReport> {
  return checkSignedAnswers(features, "Litecoin compact message", SIGNED);
}

export function runLitecoinMessageSigningFullSelfTest(
  features: FeatureFunctions,
): Promise<CryptoSelfTestReport> {
  return checkVerifiedAnswers(features, "Litecoin BIP137 and Electrum-LTC", VERIFIED);
}
