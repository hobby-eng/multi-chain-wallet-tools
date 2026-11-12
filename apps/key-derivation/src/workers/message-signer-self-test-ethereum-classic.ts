// Known answers of Ethereum Classic message signing, whose EIP-191 bytes are Ethereum's: viem's
// (src/accounts/utils/signMessage.test.ts L7-L25 at 5c6a920e), for anvil's account 0, at its EIP-55
// address (re-encoded by tmp check/b_vectors.py): at startup "hello world"; in the full self-test
// the 4-byte emoji, whose length counts bytes. Each is also refused for another message.
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import { checkSignedAnswers } from "./message-signer-self-test.js";
import type { FeatureFunctions } from "./worker-runtime.js";

const KEY = "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const request = (message: string) =>
  ({
    format: "ethereum-classic-eip191",
    address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    message,
    network: "mainnet",
  }) as const;

export function runEthereumClassicMessageSigningSelfTest(
  features: FeatureFunctions,
): Promise<CryptoSelfTestReport> {
  return checkSignedAnswers(features, "Ethereum Classic personal_sign message", [
    {
      key: KEY,
      request: request("hello world"),
      signature:
        "0xa461f509887bd19e312c0c58467ce8ff8e300d3c1a90b608a760c5b80318eaf15fe57c96f9175d6cd4daad4663763baa7e78836e067d0163e9a2ccf2ff753f5b1b",
    },
  ]);
}

export function runEthereumClassicMessageSigningFullSelfTest(
  features: FeatureFunctions,
): Promise<CryptoSelfTestReport> {
  return checkSignedAnswers(features, "Ethereum Classic personal_sign UTF-8 length", [
    {
      key: KEY,
      request: request("\u{1f975}"),
      signature:
        "0x05c99bbbe9fac3ad61721a815d19d6771ad39f3e8dffa7ae7561358f20431d8e7f9e1d487c77355790c79c6eb0b0d63690f690615ef99ee3e4f25eef0317d0701b",
    },
  ]);
}
