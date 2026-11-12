// Known answers of Ethereum message signing, eth-account's (tests/core/test_accounts.py L441-L496
// at b659d043), for the web3.js documentation key: at startup "Some data"; in the full self-test
// "10284", whose r and s both start with a zero byte. Each is also refused for another message.
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import { checkSignedAnswers } from "./message-signer-self-test.js";
import type { FeatureFunctions } from "./worker-runtime.js";

const KEY = "4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318";
const request = (message: string) =>
  ({
    format: "ethereum-eip191",
    address: "0x2c7536E3605D9C16a7a3D7b1898e529396a65c23",
    message,
    network: "mainnet",
  }) as const;

export function runEthereumMessageSigningSelfTest(
  features: FeatureFunctions,
): Promise<CryptoSelfTestReport> {
  return checkSignedAnswers(features, "Ethereum personal_sign message", [
    {
      key: KEY,
      request: request("Some data"),
      signature:
        "0xb91467e570a6466aa9e9876cbcd013baba02900b8979d43fe208a4a4f339f5fd6007e74cd82e037b800186422fc2da167c747ef045e5d18a5f5d4300f8e1a0291c",
    },
  ]);
}

export function runEthereumMessageSigningFullSelfTest(
  features: FeatureFunctions,
): Promise<CryptoSelfTestReport> {
  return checkSignedAnswers(features, "Ethereum personal_sign leading zero bytes", [
    {
      key: KEY,
      request: request("10284"),
      signature:
        "0x00515bc8fd32264e21ec0820e8c5123ed58c1195c9ea17cb018b1ad4073cc5a60080f5dcec397a5a8c523082bfa41771568903aa554ec06ba8475ca9050fb7d51b",
    },
  ]);
}
