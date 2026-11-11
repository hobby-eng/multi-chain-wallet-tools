// TON's startup self-test. Trust Wallet's and Ledger's first addresses of the "abandon … about"
// seed come from test/oracles/ton_oracle.py, which first reproduces wallet-core's state inits and
// addresses and the published code hashes. The TON phrase is ton-crypto's own test vector
// (ton-org/ton-crypto src/mnemonic/mnemonic.spec.ts, read 2026-11-10); its public key is
// ton-crypto's, and the addresses of that key are the oracle's. The phrase's key itself costs
// 100,000 PBKDF2 iterations, so the worker checks it in the full self-test only
// (apps/key-derivation/src/workers/ton-key-self-test.ts).
import { hexToBytes } from "@ckd/core/crypto.js";
import { passesTonCheck } from "@ckd/core/ton-mnemonic.js";
import { TON_COIN_ADAPTERS } from "@ckd/coins/adapters/ton.js";
import { tonWalletAddress, type TonWalletVersion } from "@ckd/coins/ton/contracts.js";
import { TON_ADDRESSES, tonDerivation } from "@ckd/coins/ton/index.js";
import { TON_STANDARD_PATH } from "@ckd/coins/ton/profiles.js";
import { singleKeyCoinSelfTest } from "./single-key-coin-self-test.js";

/** ton-crypto's test phrase, normalized: a TON phrase that is not a BIP39 phrase. */
export const TON_TEST_PHRASE =
  "hospital stove relief fringe tongue always charge angry urge sentence again match nerve inquiry senior coconut label tumble carry category beauty bean road solution";
/** Its public key, from ton-crypto's vector. */
const TON_TEST_PUBLIC_KEY = "f6c450a16bb1c514e22f1977e390a3025599aa1e7b00068a6aacf2119484c1bd";
/** That key's addresses, the Telegram wallet's W5 first. */
export const TON_TEST_ADDRESSES: Readonly<Record<TonWalletVersion, string>> = Object.freeze({
  w5: "UQDSLOFVamNZzdy4LulclcCBEFkRReZ7WscBCLAw3Pg53h3h",
  v4r2: "UQAYZ-rchbaHK4IUkCvcyl3V8spcAnO8IBRCNvS3are-CbyQ",
  v3r2: "UQDbuMbjSKj1IkoMU-whUDd5v2Om4G6tVwrwBxlrBmBtq12L",
});
/** A BIP39 phrase of 24 words that TON's check refuses (the oracle). */
const BIP39_NOT_TON = `${"abandon ".repeat(23)}art`;

const PHRASE_CHECK = "TON phrase check and wallet contracts W5, v4R2, v3R2";

function fail(what: string): never {
  throw new Error(`Cryptographic self-test failed: ${what}.`);
}

/** TON's check of a phrase, both ways, and the wallet contracts' addresses of a known key. */
function checkTonPhrase(): string {
  if (!passesTonCheck(TON_TEST_PHRASE)) fail("TON refuses its own test phrase");
  if (passesTonCheck(BIP39_NOT_TON)) fail("TON accepts a BIP39 phrase it refuses");
  const publicKey = hexToBytes(TON_TEST_PUBLIC_KEY);
  for (const [version, address] of Object.entries(TON_TEST_ADDRESSES) as [
    TonWalletVersion,
    string,
  ][])
    if (tonWalletAddress(version, publicKey) !== address) fail(`TON ${version} address`);
  return PHRASE_CHECK;
}

/** TON's worker vectors, for every edition and selective build that has it. */
export const runTonDerivationSelfTest = singleKeyCoinSelfTest({
  group: "TON",
  adapters: TON_COIN_ADAPTERS,
  derivation: tonDerivation,
  addresses: TON_ADDRESSES,
  otherPaths: [["ton", TON_STANDARD_PATH]],
  vectors: [
    {
      adapterId: "ton-trust",
      path: "m/44'/607'/0'",
      address: "UQAzWZa6nM5mJev91wGc7VCSfBoIsYRqKJpV78N8Add9-RKY",
    },
    {
      adapterId: "ton-ledger",
      path: "m/44'/607'/0'/0'/0'/0'",
      address: "UQAhEnZmOZ4XCJ1BKsvvt4D1DobiFgIf8nbZdTiT0l-8mOpj",
    },
  ],
  checks: [checkTonPhrase],
});
