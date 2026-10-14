import { deriveBitcoin } from "@ckd/coins/bitcoin/index.js";
import { BITCOIN_COIN_ADAPTERS } from "@ckd/coins/adapters/bitcoin.js";
import { runBitcoinPathSelfTest } from "@ckd/coins/bitcoin/path-self-test.js";
import { MAX_BIP32_INDEX } from "@ckd/core/bip32-limits.js";
import { checkDerivationVectors, firstAddressOf, now, type DerivationVector } from "./helpers.js";
import type { CryptoSelfTestReport } from "./types.js";

/** Bitcoin's vectors from the "abandon … about" seed: BIP44, BIP49, BIP84 and BIP86 addresses. */
const BITCOIN_VECTORS: readonly DerivationVector[] = [
  {
    name: "Bitcoin legacy",
    derive: (seed) => deriveBitcoin("legacy", firstAddressOf(seed, "mainnet")),
    address: "1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA",
  },
  {
    name: "Bitcoin nested-segwit",
    derive: (seed) => deriveBitcoin("nested-segwit", firstAddressOf(seed, "mainnet")),
    address: "37VucYSaXLCAsxYyAPfbSi9eh4iEcbShgf",
  },
  {
    name: "Bitcoin native-segwit",
    derive: (seed) => deriveBitcoin("native-segwit", firstAddressOf(seed, "mainnet")),
    address: "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu",
  },
  {
    // BIP86's own test vector, with its account key.
    name: "Bitcoin taproot",
    derive: (seed) => deriveBitcoin("taproot", firstAddressOf(seed, "mainnet")),
    address: "bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr",
    accountXpub:
      "xpub6BgBgsespWvERF3LHQu6CnqdvfEvtMcQjYrcRzx53QJjSxarj2afYWcLteoGVky7D3UKDP9QyrLprQ3VCECoY49yfdDEHGCtMMj92pReUsQ",
  },
  {
    name: "Bitcoin testnet / BIP49",
    derive: (seed) => deriveBitcoin("nested-segwit", firstAddressOf(seed, "testnet")),
    address: "2Mww8dCYPUpKHofjgcXcBCEGmniw9CoaiD2",
  },
  {
    name: "Bitcoin maximum child index",
    derive: (seed) => deriveBitcoin("legacy", firstAddressOf(seed, "mainnet", MAX_BIP32_INDEX)),
    address: "12PyCxyiKLJc6WewJd173MRDVVdR6VpJ2j",
  },
];

/** Bitcoin-only worker vectors for selectively composed offline artifacts. */
export async function runBitcoinDerivationSelfTest(): Promise<CryptoSelfTestReport> {
  const started = now();
  const pathChecks = runBitcoinPathSelfTest({ COIN_ADAPTERS: BITCOIN_COIN_ADAPTERS });
  const checks = checkDerivationVectors(
    BITCOIN_VECTORS,
    "Bitcoin master/account extended-key integrity",
  );
  checks.unshift(...pathChecks);
  return { passed: true, checks, durationMs: Math.round(now() - started) };
}
