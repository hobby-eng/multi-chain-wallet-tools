// Known answers of Bitcoin Cash message signing. At startup: Electron Cash's plain RFC 6979
// signature (electroncash/tests/test_bitcoin.py L56-L103 at 7f4afadb), signed for the CashAddr of
// its key (re-encoded with tmp check/a2_vectors.py); the same signature also proves the legacy
// form. In the full self-test, verify-only vectors: Electron Cash's Bitcoin ABC nonce signature of
// the same message; Trezor's verify vector (tests/device_tests/bitcoin/test_verifymessage.py
// L195-L205 at 93127ae4), in Base64; Bitcoin Cash Node's (test/functional/rpc_signmessage.py
// L22-L28 at a5633bd1), for the mainnet CashAddr of its key.
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import { checkSignedAnswers, checkVerifiedAnswers } from "./message-signer-self-test.js";
import type { FeatureFunctions } from "./worker-runtime.js";

const CHANCELLOR = "Chancellor on brink of second bailout for banks";
const ELECTRON_CASH = "bitcoincash:qqehccy89v7ftlfgr9v0zvhjzyy7eatdkqt05lt3nw";
const SIGNATURE =
  "H/9jMOnj4MFbH3d7t4yCQ9i7DgZU/VZ278w3+ySv2F4yIsdqjsc5ng3kmN8OZAThgyfCZOQxZCWza9V5XzlVY0Y=";
const request = (address: string, message = CHANCELLOR) =>
  ({ format: "bitcoin-cash-compact", address, message, network: "mainnet" }) as const;

export function runBitcoinCashMessageSigningSelfTest(
  features: FeatureFunctions,
): Promise<CryptoSelfTestReport> {
  const key = "7e96f68c3c15d6884d254c2b68356faf15b4d0f00001fc2f1e9e4f9e434ba9cd";
  return checkSignedAnswers(features, "Bitcoin Cash compact message", [
    { key, request: request(ELECTRON_CASH), signature: SIGNATURE },
    { key, request: request("15hETetDmcXm1mM4sEf7U2KXC9hDHFMSzz"), signature: SIGNATURE },
  ]);
}

export function runBitcoinCashMessageSigningFullSelfTest(
  features: FeatureFunctions,
): Promise<CryptoSelfTestReport> {
  return checkVerifiedAnswers(features, "Bitcoin Cash Electron Cash, Trezor and BCHN", [
    {
      request: request(ELECTRON_CASH),
      signature:
        "IA+oq/uGz4kKA2bNgxPcM+T216abyUiBhofMg1J8fC5BLAbbIpF2toCHaO7/LQAxhQBtu5D6ROq1JjXiRwPAASg=",
      expected: true,
    },
    {
      request: request(
        "bitcoincash:qqj22md58nm09vpwsw82fyletkxkq36zxyxh322pru",
        "This is an example of a signed message.",
      ),
      signature:
        "IJ4j7fDk5H/x3sJ/Ms14xQ507wGO6Kat81rhfHqbDdlvSLST/X26sD77b0OcY4PJUjs7vF8afRWKavkKsVTpvoA=",
      expected: true,
    },
    {
      request: request(
        "bitcoincash:qpst4g85jjecec7fgr02vlecqnw9950mjsf0678ndh",
        "This is just a test message",
      ),
      signature:
        "IPDOIFcWd8LzOr70CXaal4+uG2ZZWcbHqutyGeO7AJ0MWbqq9C+u3KP9ScjtLzsIgY3st5n8XFQvgMZ0KrDQ9vg=",
      expected: true,
    },
  ]);
}
