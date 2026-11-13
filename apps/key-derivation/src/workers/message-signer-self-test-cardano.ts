// The known answers of Cardano message signing, CIP-30's signData.
// - Startup: cardano-signer's published CIP-8 signature (gitmachtl/cardano-signer @3cc4a74
//   README.md, "Hello world" for its enterprise address), byte for byte: its COSE_Sign1 and COSE_Key.
//   Its key is a plain Ed25519 key, so the answer signs with RFC 8032's expansion of it, kL clamped
//   and kR, which test/oracles/cardano_oracle.py computes and checks against the published public
//   key and signature.
// - Full self-test: own values of the oracle, which first reproduces cardano-signer's and Trezor's
//   published signatures (trezor-firmware @433075c common/tests/fixtures/cardano/sign_message.json):
//   the self-test message signed by the stake key of "abandon ... about" for its reward address; the
//   same signature with one bit changed, and with the base address's COSE_Key pasted, both not
//   valid; the stake key's signature naming the base address, not valid since the stake key's hash
//   is not that address's payment credential; and a COSE_Sign1 whose header has a non-shortest
//   integer, refused as unreadable.
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import {
  checkSignedAnswers,
  checkVerifiedAnswers,
  SIGNING_SELF_TEST_MESSAGE,
} from "./message-signer-self-test.js";
import type { FeatureFunctions } from "./worker-runtime.js";

export function runCardanoMessageSigningSelfTest(
  features: FeatureFunctions,
): Promise<CryptoSelfTestReport> {
  return checkSignedAnswers(features, "Cardano CIP-30 signData message", [
    {
      key: "6844e21291a90fcd57b8472a707fea2758e315411fe809ac17a4c3b12476944a1ff5a381b976d133e6d16f7d834695a523a76ddb3153bb51c4e6e620db67fb1f",
      request: {
        format: "cardano-cip30",
        address: "addr1v9ux8dwy800s5pnq327g9uzh8f2fw98ldytxqaxumh3e8kqumfr6d",
        message: "Hello world",
        network: "mainnet",
        inputs: {
          publicKeyHex: "755b017578b701dc9ddd4eaee67015b4ca8baf66293b7b1d204df426c0ceccb9",
        },
      },
      signature:
        '{"signature":"84582aa201276761646472657373581d617863b5c43bdf0a06608abc82f0573a549714ff69166074dcdde393d8a166686173686564f44b48656c6c6f20776f726c645840fc58155f0cee05bc00e7299af1df1f159ac82a46a055786b259657934eff346eec81349d4678ceabc79f213c66a2bdbfd4ea5d9ebdc630bee5ac9cce75cfc001","key":"a4010103272006215820755b017578b701dc9ddd4eaee67015b4ca8baf66293b7b1d204df426c0ceccb9"}',
    },
  ]);
}

/** "abandon ... about"'s Icarus stake key: its reward address and public key. */
const STAKE = {
  format: "cardano-cip30",
  address: "stake1u8j40zgr2gy4788kl54h6x3gu0pukq5lfr8nflufpg5dzaskqlx2l",
  message: SIGNING_SELF_TEST_MESSAGE,
  network: "mainnet",
  inputs: { publicKeyHex: "012f5dc3115b8a07981e6e50f5a671e2c6fbb26c3ffde1cd1dcaf40a7fe8f160" },
} as const;
/** The COSE_Sign1 of the stake key's signature, its last byte to be changed by one bit. */
const STAKE_SIGN1 =
  "84582aa201276761646472657373581de1e557890352095f1cf6fd2b7d1a28e3c3cb029f48cf34ff890a28d176a166686173686564f458214f66666c696e65206d657373616765207369676e696e672073656c662d746573745840dce6f448d1f69cbc7b4aac5e169d3068a509a4b72c6ea99c01880479d6bd6ee8136826199a2ca4ec0155971844871eaf6405c04f03bdb108d57af3eec81810";
const STAKE_KEY =
  "a4010103272006215820012f5dc3115b8a07981e6e50f5a671e2c6fbb26c3ffde1cd1dcaf40a7fe8f160";
/**
 * The stake key's COSE_Sign1 of the self-test message for the base address of "abandon ... about",
 * which names that address as its own signature would.
 */
const STAKE_FOR_BASE =
  "845846a2012767616464726573735839010fdc780023d8be7c9ff3a6bdc0d8d3b263bd0cc12448c40948efbf42e557890352095f1cf6fd2b7d1a28e3c3cb029f48cf34ff890a28d176a166686173686564f458214f66666c696e65206d657373616765207369676e696e672073656c662d74657374584011a9600c20f2feeb2a2dad910cf1c5faa19ae6a5e4f61b56f16d95d49f4196fa841f757c94f76a7ed20dd582408e012c434bf5981e9df604c54161976d2ed100";
const BASE_ADDRESS =
  "addr1qy8ac7qqy0vtulyl7wntmsxc6wex80gvcyjy33qffrhm7sh927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq4afdhv";

/** The COSE_Key of the base address's payment key, another key than the stake key. */
const PAYMENT_KEY =
  "a40101032720062158207ea09a34aebb13c9841c71397b1cabfec5ddf950405293dee496cac2f437480a";

export function runCardanoMessageSigningFullSelfTest(
  features: FeatureFunctions,
): Promise<CryptoSelfTestReport> {
  return checkVerifiedAnswers(features, "Cardano CIP-30 signData", [
    {
      request: STAKE,
      signature: `{"signature":"${STAKE_SIGN1}02","key":"${STAKE_KEY}"}`,
      expected: true,
    },
    {
      request: STAKE,
      signature: `{"signature":"${STAKE_SIGN1}03","key":"${STAKE_KEY}"}`,
      expected: false,
    },
    {
      request: STAKE,
      signature: `{"signature":"${STAKE_SIGN1}02","key":"${PAYMENT_KEY}"}`,
      expected: false,
    },
    {
      request: { ...STAKE, address: BASE_ADDRESS },
      signature: `{"signature":"${STAKE_FOR_BASE}","key":"${STAKE_KEY}"}`,
      expected: false,
    },
    {
      // The protected header's algorithm -8 written as 0x38 0x07, two bytes where one suffices.
      request: STAKE,
      signature: `${STAKE_SIGN1.replace("582aa20127", "582ba2013807")}02`,
      expected: "INVALID_SIGNATURE",
    },
  ]);
}
