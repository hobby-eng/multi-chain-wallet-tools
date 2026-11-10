// The BIP44 coins (Litecoin, Dogecoin, Bitcoin Cash, Zcash, XRP, Tron, Ethereum Classic, Cosmos,
// Injective) against two independent sources: Trust Wallet's wallet-core, whose
// tests/common/CoinAddressDerivationTests.cpp derives every coin's address from the private key
// 0x46…46, and MnemoCode's own Rust (its WebAssembly, vendored), which finds each address the
// Deriver gives for the public "abandon … about" phrase at the path the Deriver names.
import { beforeAll, describe, expect, it } from "vitest";
import { hexToBytes, secp256k1 } from "@ckd/core/crypto.js";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { clearDerivationResult } from "@ckd/core/secrets.js";
import type { Bip32BatchOptions, DerivationResult, ResultField } from "@ckd/core/types.js";
import { paymentQrPayload } from "@ckd/ui/payment-qr.js";
import { loadMnemoCode } from "@ckd/recovery-backup/mnemocode-module.js";
import type { MnemoCodeBinding } from "@ckd/recovery-backup/mnemocode-engine.js";
import type { Bip44CoinKeys } from "@ckd/coins/bip44-coin.js";
import { bitcoinCashDerivation, BITCOIN_CASH_KEYS } from "@ckd/coins/bitcoin-cash/index.js";
import { cosmosDerivation, COSMOS_KEYS } from "@ckd/coins/cosmos/index.js";
import { dogecoinDerivation, DOGECOIN_KEYS } from "@ckd/coins/dogecoin/index.js";
import {
  ethereumClassicDerivation,
  ETHEREUM_CLASSIC_KEYS,
} from "@ckd/coins/ethereum-classic/index.js";
import { injectiveDerivation, INJECTIVE_KEYS } from "@ckd/coins/injective/index.js";
import { litecoinDerivation, litecoinKeys } from "@ckd/coins/litecoin/index.js";
import { LITECOIN_PROFILES } from "@ckd/coins/litecoin/profiles.js";
import { tronDerivation, TRON_KEYS } from "@ckd/coins/tron/index.js";
import { xrpDerivation, XRP_KEYS } from "@ckd/coins/xrp/index.js";
import { zcashDerivation, ZCASH_KEYS } from "@ckd/coins/zcash/index.js";

const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

const nativeSegwit = LITECOIN_PROFILES.find(
  ({ adapterId }) => adapterId === "litecoin-native-segwit",
);
if (nativeSegwit === undefined) throw new Error("Litecoin native SegWit profile is missing.");

/** wallet-core's expected addresses for the private key 0x46 x 32, each coin's default form. */
const WALLET_CORE: readonly (readonly [string, Bip44CoinKeys, string])[] = [
  ["Litecoin", litecoinKeys(nativeSegwit), "ltc1qhkfq3zahaqkkzx5mjnamwjsfpq2jk7z0tamvsu"],
  ["Dogecoin", DOGECOIN_KEYS, "DNRTC6GZ5evmM7BZWwPqF54fyDqUqULMyu"],
  ["Bitcoin Cash", BITCOIN_CASH_KEYS, "bitcoincash:qz7eyzytkl5z6cg6nw20hd62pyyp22mcfuardfd2vn"],
  ["Zcash", ZCASH_KEYS, "t1b9xfAk3kZp5Qk3rinDPq7zzLkJGHTChDS"],
  ["XRP", XRP_KEYS, "rJHMeqKu8Ep7Fazx8MQG6JunaafBXz93YQ"],
  ["Tron", TRON_KEYS, "TQLCsShbQNXMTVCjprY64qZmEA4rBarpQp"],
  ["Ethereum Classic", ETHEREUM_CLASSIC_KEYS, "0x9d8A62f656a8d1615C1294fd71e9CFb3E4855A4F"],
  ["Cosmos", COSMOS_KEYS, "cosmos1hkfq3zahaqkkzx5mjnamwjsfpq2jk7z0emlrvp"],
  ["Injective", INJECTIVE_KEYS, "inj1nk9x9ajk4rgkzhqjjn7hr6w0k0jg2kj0knl55v"],
];

/** Every adapter of the BIP44 coins, with MnemoCode's coin id and its derivation. */
const ADAPTERS: readonly (readonly [string, string, Derivation])[] = [
  ["litecoin-legacy", "litecoin", litecoinDerivation],
  ["litecoin-nested-segwit", "litecoin", litecoinDerivation],
  ["litecoin-native-segwit", "litecoin", litecoinDerivation],
  ["dogecoin", "dogecoin", dogecoinDerivation],
  ["bitcoin-cash", "bitcoin-cash", bitcoinCashDerivation],
  ["bitcoin-cash-coin-type-0", "bitcoin-cash", bitcoinCashDerivation],
  ["zcash", "zcash", zcashDerivation],
  ["xrp", "xrp", xrpDerivation],
  ["tron", "tron", tronDerivation],
  ["ethereum-classic", "ethereum-classic", ethereumClassicDerivation],
  ["cosmos", "cosmos", cosmosDerivation],
  ["injective", "injective", injectiveDerivation],
];

let binding: MnemoCodeBinding;
beforeAll(async () => {
  binding = await loadMnemoCode();
});

type Derivation = (id: string) => ((options: Bip32BatchOptions) => DerivationResult) | undefined;

/** The address and path of child `index` of `account`'s `branch` for the adapter `id`. */
function derived(
  id: string,
  derivation: Derivation,
  account: number,
  branch: number,
  index: number,
) {
  const derive = derivation(id);
  if (derive === undefined) throw new Error(`${id} has no derivation.`);
  const seed = mnemonicToSeed(PHRASE);
  const result = derive({ seed, network: "mainnet", account, branch, start: index, count: 1 });
  try {
    const row = result.rows[0];
    const address = row?.basic.find(({ key }) => key === "address")?.value;
    if (row === undefined || address === undefined) throw new Error(`${id} gave no address.`);
    return { address, path: row.path };
  } finally {
    clearDerivationResult(result);
  }
}

/** Every field of account 0's first receiving key of adapter `id`, with the summary, by key. */
function fieldsOf(id: string, derivation: Derivation): Record<string, string> {
  const derive = derivation(id);
  if (derive === undefined) throw new Error(`${id} has no derivation.`);
  const seed = mnemonicToSeed(PHRASE);
  const result = derive({ seed, network: "mainnet", account: 0, branch: 0, start: 0, count: 1 });
  try {
    const row = result.rows[0];
    return Object.fromEntries(
      [...result.summary, ...(row?.basic ?? []), ...(row?.advanced ?? [])].map(({ key, value }) => [
        key,
        value,
      ]),
    );
  } finally {
    clearDerivationResult(result);
  }
}

/** The address field of account 0's first receiving key of adapter `id`. */
function addressField(id: string, derivation: Derivation): ResultField {
  const derive = derivation(id);
  if (derive === undefined) throw new Error(`${id} has no derivation.`);
  const seed = mnemonicToSeed(PHRASE);
  const result = derive({ seed, network: "mainnet", account: 0, branch: 0, start: 0, count: 1 });
  const field = result.rows[0]?.basic.find(({ key }) => key === "address");
  if (field === undefined) throw new Error(`${id} gave no address.`);
  return { ...field };
}

describe("BIP44 coins", () => {
  it("encode wallet-core's addresses of the private key 0x46…46", () => {
    const publicKey = secp256k1.getPublicKey(hexToBytes("46".repeat(32)), true);
    for (const [name, keys, expected] of WALLET_CORE)
      expect([name, keys.address(publicKey).address]).toEqual([name, expected]);
  });

  it("derive addresses that MnemoCode's own derivation finds at the same paths", () => {
    for (const [id, coin, derivation] of ADAPTERS)
      for (const [account, branch, index] of [
        [0, 0, 0],
        [0, 1, 3],
        [1, 0, 2],
      ] as const) {
        const { address, path } = derived(id, derivation, account, branch, index);
        using evidence = binding.WalletEvidence.coinAddress(
          coin,
          address,
          account,
          branch,
          index,
          1,
        );
        using check = evidence.check(PHRASE, undefined);
        expect([id, address, check.matched, check.path]).toEqual([id, address, true, path]);
      }
  });

  it("encode the private keys, Dogecoin's dgub keys and the old address forms independently known", () => {
    // test/oracles/bip32_oracle.py, which first reproduces BIP86's master xpub of the phrase.
    const first = (id: string, derivation: Derivation) => fieldsOf(id, derivation);
    expect(first("litecoin-legacy", litecoinDerivation).privateKey).toBe(
      "T5b4RiWRs7XG8xZ2bCHBoJcn4JrpMTbGRFYXgoZHd7nD8izwqhMK",
    );
    const dogecoin = first("dogecoin", dogecoinDerivation);
    expect(dogecoin.privateKey).toBe("QPkeC1ZfHx3c9g7WTj9cQ8gnvk2iSAfAcbq1aVAWjNTwDAKfZUzx");
    expect(dogecoin.accountXpub).toBe(
      "dgub8rUhDtD3YFGZTUphBfpBbzvFxSMKQXYLzg87Me2ta78r2SdVLmypBUkkxrrn9RTnchsyiJSkHZyLWxD13ibBiXtuFWktBoDaGaZjQUBLNLs",
    );
    expect(dogecoin.masterXpub).toBe(
      "dgub8kXBZ7ymNWy2RzFfCuAkHMfuUEjbxDK33snqz5r7YTvUsExaHDbWWdju6FedaPkBTDmwMqtGHL8NhLDczSVBKMdpJHR6KrcTDQdnwPMrQZU",
    );
    expect(first("zcash", zcashDerivation).privateKey).toBe(
      "KzEVy5oaBPhVPxH43bUg1g1zTv5Jitvc9nZesqqqc18Edi4bHQbu",
    );
    const bitcoinCash = first("bitcoin-cash", bitcoinCashDerivation);
    expect(bitcoinCash.privateKey).toBe("KxbEv3FeYig2afQp7QEA9R3gwqdTBFwAJJ6Ma7j1SkmZoxC9bAXZ");
    expect(bitcoinCash.legacyAddress).toBe("1mW6fDEMjKrDHvLvoEsaeLxSCzZBf3Bfg");
    expect(first("litecoin-nested-segwit", litecoinDerivation).oldP2shAddress).toBe(
      "31jkZShyVAMkVz5cQpu4qp73DrAXtFP3rZ",
    );
  });

  it("put the standard payment URI scheme on Litecoin, Dogecoin and Zcash addresses only", () => {
    expect(paymentQrPayload(addressField("litecoin-native-segwit", litecoinDerivation))).toBe(
      "litecoin:ltc1qjmxnz78nmc8nq77wuxh25n2es7rzm5c2rkk4wh",
    );
    expect(paymentQrPayload(addressField("dogecoin", dogecoinDerivation))).toBe(
      "dogecoin:DBus3bamQjgJULBJtYXpEzDWQRwF5iwxgC",
    );
    expect(paymentQrPayload(addressField("zcash", zcashDerivation))).toBe(
      "zcash:t1XVXWCvpMgBvUaed4XDqWtgQgJSu1Ghz7F",
    );
    // A CashAddr carries its own prefix; XRP's wallets share no URI scheme.
    expect(paymentQrPayload(addressField("bitcoin-cash", bitcoinCashDerivation))).toBe(
      "bitcoincash:qqyx49mu0kkn9ftfj6hje6g2wfer34yfnq5tahq3q6",
    );
    expect(paymentQrPayload(addressField("xrp", xrpDerivation))).toBe(
      "rHsMGQEkVNJmpGWs8XUBoTBiAAbwxZN5v3",
    );
  });

  it("refuse another coin's adapter id", () => {
    expect(litecoinDerivation("dogecoin")).toBeUndefined();
    expect(xrpDerivation("tron")).toBeUndefined();
  });
});
