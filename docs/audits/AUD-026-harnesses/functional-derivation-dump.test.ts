// AUD-026 functional: dumps what the production derivation entry points return (the worker's
// getRuntimeCoinAdapter(id).derive, BIP39 entropy/seed conversion) for public test phrases, so that
// functional-derivation-oracle.py can recompute every value with its own pure-Python BIP39/BIP32/
// secp256k1/Base58/Bech32/Keccak code. It also checks, on the production side, that the seed passed
// in is not mutated and that bounds are refused. Output: docs/audits/AUD-026-evidence/functional/
// derivations.json (local evidence only).
import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  englishMnemonicToEntropy,
  entropyToEnglishMnemonic,
  mnemonicToSeed,
} from "@ckd/core/bip39.js";
import { bytesToHex } from "@ckd/core/crypto.js";
import { getRuntimeCoinAdapter } from "@ckd/coins/runtime-registry.js";
import { getRuntimeCoinAdapter as getDashRuntimeAdapter } from "@ckd/coins/dash-runtime-registry.js";

const OUT = new URL("../AUD-026-evidence/functional/", import.meta.url);

const ABANDON = `${"abandon ".repeat(11)}about`;
const PHRASES: { label: string; mnemonic: string; passphrase: string }[] = [
  { label: "abandon-about", mnemonic: ABANDON, passphrase: "" },
  { label: "abandon-about-TREZOR", mnemonic: ABANDON, passphrase: "TREZOR" },
  // NFKD of the passphrase: U+00C4 must equal "A" + U+0308 (BIP39).
  { label: "abandon-about-nfkd", mnemonic: ABANDON, passphrase: "Äpfel" },
  {
    label: "all-ones-24",
    mnemonic: entropyToEnglishMnemonic(new Uint8Array(32).fill(0xff)),
    passphrase: "",
  },
  {
    label: "counting-18",
    mnemonic: entropyToEnglishMnemonic(Uint8Array.from({ length: 24 }, (_, i) => i)),
    passphrase: "",
  },
];

const ADAPTERS = [
  "bitcoin-legacy",
  "bitcoin-nested-segwit",
  "bitcoin-native-segwit",
  "bitcoin-taproot",
  "ethereum",
  "dash-core",
  "dash-core-coinjoin",
  "dash-legacy-mobile",
  "dash-platform",
  "dash-identity",
  "dash-multisig-p2sh",
  "dash-multisig-core-pkh",
] as const;

const MAX = 2 ** 31 - 1;
const SHAPES = [
  { network: "mainnet", account: 0, branch: 0, start: 0, count: 2 },
  { network: "mainnet", account: 0, branch: 1, start: 0, count: 1 },
  { network: "testnet", account: 1, branch: 0, start: 5, count: 1 },
  { network: "testnet", account: 0, branch: 1, start: 0, count: 1 },
  { network: "mainnet", account: MAX, branch: 1, start: MAX, count: 1 },
] as const;

describe("AUD-026 functional derivation dump", () => {
  it("dumps production outputs and checks seed immutability", async () => {
    const dump: unknown[] = [];
    for (const phrase of PHRASES) {
      const seed = mnemonicToSeed(phrase.mnemonic, phrase.passphrase);
      const entropy = englishMnemonicToEntropy(phrase.mnemonic);
      const seedHex = bytesToHex(seed);
      const cases: unknown[] = [];
      for (const id of ADAPTERS) {
        for (const shape of SHAPES) {
          // Platform branches are key classes 0/1; Identity ignores account/branch.
          const input = { seed, ...shape };
          const before = bytesToHex(seed);
          let result: unknown;
          let error: string | null = null;
          try {
            result = await getRuntimeCoinAdapter(id).derive(input);
          } catch (cause) {
            error = cause instanceof Error ? cause.message : String(cause);
          }
          expect(bytesToHex(seed)).toBe(before);
          cases.push({ id, shape, result, error });
        }
      }
      dump.push({
        ...phrase,
        entropyHex: bytesToHex(entropy),
        seedHex,
        cases,
      });
    }
    // The Dash Community registry must dispatch the same functions with the same results.
    const seed = mnemonicToSeed(ABANDON, "");
    for (const id of ADAPTERS.filter((name) => name.startsWith("dash"))) {
      const shape = {
        seed,
        network: "mainnet" as const,
        account: 0,
        branch: 0,
        start: 0,
        count: 2,
      };
      const multi = await getRuntimeCoinAdapter(id).derive(shape);
      const dash = await getDashRuntimeAdapter(id).derive(shape);
      expect(JSON.stringify(dash)).toBe(JSON.stringify(multi));
    }
    mkdirSync(OUT, { recursive: true });
    writeFileSync(new URL("derivations.json", OUT), JSON.stringify(dump, null, 1));
  });

  it("refuses out-of-range requests at every adapter", async () => {
    const seed = mnemonicToSeed(ABANDON, "");
    const refusals: Record<string, string[]> = {};
    const bad = [
      { account: -1, branch: 0, start: 0, count: 1 },
      { account: MAX + 1, branch: 0, start: 0, count: 1 },
      { account: 0.5, branch: 0, start: 0, count: 1 },
      { account: 0, branch: 2, start: 0, count: 1 },
      { account: 0, branch: 0, start: MAX, count: 2 },
      { account: 0, branch: 0, start: 0, count: 0 },
      { account: 0, branch: 0, start: 0, count: 51 },
      { account: 0, branch: 0, start: Number.NaN, count: 1 },
    ];
    for (const id of ADAPTERS) {
      refusals[id] = [];
      for (const shape of bad) {
        let message = "accepted";
        try {
          await getRuntimeCoinAdapter(id).derive({ seed, network: "mainnet", ...shape });
        } catch (cause) {
          message = cause instanceof Error ? cause.message : String(cause);
        }
        refusals[id].push(`${JSON.stringify(shape)} -> ${message}`);
      }
    }
    mkdirSync(OUT, { recursive: true });
    writeFileSync(new URL("refusals.json", OUT), JSON.stringify(refusals, null, 1));
  });
});
