// AUD-023 (mnemocode reviewer): coin-address wallet evidence through the Deriver's production
// path. Expected addresses come from an independent derivation in this file (@scure/bip39 seed,
// @scure/bip32 keys, @noble/hashes and @scure/base encodings, its own CashAddr and EIP-55), which
// first reproduces the published BIP84 vector and BIP44/BIP49 values of the public phrase; none of
// MnemoCode's coin modules is used to compute an expected value. The production path is the
// recognition the search and shares workers build (mnemocode-wallet-bitcoin.ts, or its Dash and
// fingerprint replacements) with the Deriver's WebCrypto PBKDF2, and MnemoCodeSearches.words.
// Public test data only.
//
// Adapted during the AUD-023 remediation: mnemocode-wallet-coins.ts with a build's offered coins
// (mnemocode-offered-coins.ts) replaced mnemocode-wallet-dash.ts and mnemocode-wallet-fingerprint.ts
// (AUD-023-BLD001, AUD-023-API002), so the Dash and fingerprint-only editions are composed here as
// the build composes them.
import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync } from "@scure/bip39";
import { base58xrp, bech32, createBase58check } from "@scure/base";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { describe, expect, it, vi } from "vitest";
import { MnemoCodeWalletRecognition as BitcoinRecognition } from "../../../packages/recovery-backup/src/mnemocode-wallet-bitcoin.js";
import type { MnemoCodeWalletRecognition as CoinsRecognition } from "../../../packages/recovery-backup/src/mnemocode-wallet-coins.js";
import { MnemoCodeSearches } from "../../../packages/recovery-backup/src/mnemocode-search.js";
import type { WalletEvidence } from "../../../packages/recovery-backup/src/mnemocode-wallet.js";
import { webCryptoPbkdf2 } from "../../../apps/key-derivation/src/workers/webcrypto-pbkdf2.js";
import { MAX_SHOWN_CANDIDATES } from "../../../packages/recovery-mnemocode/source/core/candidates.js";
import { DASH } from "../../../packages/recovery-mnemocode/source/core/coins/dash.js";
import { DASH_ADDRESS_SELF_TEST } from "../../../packages/recovery-mnemocode/source/core/coins/dash-self-test.js";
import type { Coin } from "../../../packages/recovery-mnemocode/source/core/coins/coin.js";
import type { SelfTestFeature } from "../../../packages/recovery-mnemocode/source/core/self-test-check.js";

/** The recognition of a build without Bitcoin that offers `coins`, as the build composes it. */
async function withoutBitcoin(
  coins: readonly Coin[],
  checks: readonly SelfTestFeature[],
): Promise<typeof CoinsRecognition> {
  const offered = "../../../packages/recovery-backup/src/mnemocode-offered-coins.js";
  vi.resetModules();
  vi.doMock(offered, () => ({ OFFERED_COINS: coins, OFFERED_COIN_CHECKS: checks }));
  const module = await import("../../../packages/recovery-backup/src/mnemocode-wallet-coins.js");
  vi.doUnmock(offered);
  return module.MnemoCodeWalletRecognition;
}
// The Dash Community edition offers Dash; a build with neither Bitcoin, Dash nor Ethereum none.
const DashRecognition = await withoutBitcoin([DASH], [DASH_ADDRESS_SELF_TEST]);
const FingerprintRecognition = await withoutBitcoin([], []);

const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const OTHER = "legal winner thank year wave sausage worth useful legal winner thank yellow";
const PASSPHRASE = "TREZOR";

// ---- Independent derivation -------------------------------------------------------------------
const roots = new Map<string, HDKey>();
function root(passphrase: string): HDKey {
  if (!roots.has(passphrase))
    roots.set(passphrase, HDKey.fromMasterSeed(mnemonicToSeedSync(PHRASE, passphrase)));
  return roots.get(passphrase)!;
}
const keyAt = (path: string, passphrase = ""): Uint8Array =>
  root(passphrase).derive(path).publicKey!;
const hash160 = (bytes: Uint8Array): Uint8Array => ripemd160(sha256(bytes));
const b58check = createBase58check(sha256);
const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) (out.set(p, at), (at += p.length));
  return out;
};
const p2pkh = (version: number[], key: Uint8Array) =>
  b58check.encode(concat(Uint8Array.from(version), hash160(key)));
const p2shP2wpkh = (version: number, key: Uint8Array) =>
  b58check.encode(
    concat(Uint8Array.of(version), hash160(concat(Uint8Array.of(0x00, 0x14), hash160(key)))),
  );
const p2wpkh = (hrp: string, key: Uint8Array) =>
  bech32.encode(hrp, [0, ...bech32.toWords(hash160(key))]);
const ethBytes = (key: Uint8Array): Uint8Array => {
  const uncompressed = secp256k1.Point.fromBytes(key).toBytes(false);
  return keccak_256(uncompressed.slice(1)).slice(12);
};
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const eip55 = (bytes: Uint8Array): string => {
  const lower = hex(bytes);
  const digest = hex(keccak_256(new TextEncoder().encode(lower)));
  return `0x${[...lower].map((c, i) => (Number.parseInt(digest[i]!, 16) >= 8 ? c.toUpperCase() : c)).join("")}`;
};
const xrp = (key: Uint8Array): string => {
  const payload = concat(Uint8Array.of(0x00), hash160(key));
  return base58xrp.encode(concat(payload, sha256(sha256(payload)).slice(0, 4)));
};
// CashAddr (spec: bitcoincashorg/bitcoincash.org spec/cashaddr.md), written here independently.
const CASH_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
function cashPolymod(values: number[]): bigint {
  const generators = [0x98f2bc8e61n, 0x79b76d99e2n, 0xf33e5fb3c4n, 0xae2eabe2a8n, 0x1e4f43e470n];
  let c = 1n;
  for (const d of values) {
    const c0 = c >> 35n;
    c = ((c & 0x07ffffffffn) << 5n) ^ BigInt(d);
    for (let i = 0; i < 5; i += 1) if ((c0 >> BigInt(i)) & 1n) c ^= generators[i]!;
  }
  return c ^ 1n;
}
const cashaddr = (key: Uint8Array): string => {
  const data = bech32.toWords(concat(Uint8Array.of(0x00), hash160(key)));
  const prefix = [..."bitcoincash"].map((ch) => ch.charCodeAt(0) & 0x1f);
  const mod = cashPolymod([...prefix, 0, ...data, 0, 0, 0, 0, 0, 0, 0, 0]);
  const checksum = Array.from({ length: 8 }, (_, i) => Number((mod >> BigInt(5 * (7 - i))) & 31n));
  return `bitcoincash:${[...data, ...checksum].map((d) => CASH_CHARSET[d]).join("")}`;
};

interface CoinCase {
  readonly coin: Exclude<Extract<WalletEvidence, { kind: "coin-address" }>["coin"], "bitcoin">;
  readonly coinType: number;
  readonly address: (key: Uint8Array) => string;
}
const COINS: readonly CoinCase[] = [
  { coin: "bitcoin-cash", coinType: 145, address: cashaddr },
  {
    coin: "cosmos",
    coinType: 118,
    address: (k) => bech32.encode("cosmos", bech32.toWords(hash160(k))),
  },
  { coin: "dash", coinType: 5, address: (k) => p2pkh([0x4c], k) },
  { coin: "dogecoin", coinType: 3, address: (k) => p2pkh([0x1e], k) },
  { coin: "ethereum", coinType: 60, address: (k) => eip55(ethBytes(k)) },
  { coin: "ethereum-classic", coinType: 61, address: (k) => eip55(ethBytes(k)) },
  {
    coin: "injective",
    coinType: 60,
    address: (k) => bech32.encode("inj", bech32.toWords(ethBytes(k))),
  },
  { coin: "litecoin", coinType: 2, address: (k) => p2pkh([0x30], k) },
  {
    coin: "tron",
    coinType: 195,
    address: (k) => b58check.encode(concat(Uint8Array.of(0x41), ethBytes(k))),
  },
  { coin: "xrp", coinType: 144, address: xrp },
  { coin: "zcash", coinType: 133, address: (k) => p2pkh([0x1c, 0xb8], k) },
];
const pathOf = (coinType: number, index: number) => `m/44'/${coinType}'/0'/0/${index}`;
const addressOf = (c: CoinCase, index: number, passphrase = "") =>
  c.address(keyAt(pathOf(c.coinType, index), passphrase));
const coinEvidence = (
  coin: string,
  value: string,
  index = 0,
  addresses: number | undefined = 20,
): WalletEvidence =>
  ({
    kind: "coin-address",
    coin,
    value,
    location: { account: 0, branch: 0, index },
    ...(addresses === undefined ? {} : { addresses }),
  }) as WalletEvidence;

describe("AUD-023 independent derivation reproduces published values first", () => {
  it("BIP84 (published), BIP44 and BIP49 first addresses of the public phrase", () => {
    expect(p2wpkh("bc", keyAt("m/84'/0'/0'/0/0"))).toBe(
      "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu",
    );
    expect(p2pkh([0x00], keyAt("m/44'/0'/0'/0/0"))).toBe("1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA");
    expect(p2shP2wpkh(0x05, keyAt("m/49'/0'/0'/0/0"))).toBe("37VucYSaXLCAsxYyAPfbSi9eh4iEcbShgf");
  });

  it("agrees with MnemoCode's own first-address vectors (computed by it separately)", () => {
    const expected: Record<string, string> = {
      "bitcoin-cash": "bitcoincash:qqyx49mu0kkn9ftfj6hje6g2wfer34yfnq5tahq3q6",
      cosmos: "cosmos19rl4cm2hmr8afy4kldpxz3fka4jguq0auqdal4",
      dash: "XoJA8qE3N2Y3jMLEtZ3vcN42qseZ8LvFf5",
      dogecoin: "DBus3bamQjgJULBJtYXpEzDWQRwF5iwxgC",
      injective: "inj1npvwllfr9dqr8erajqqr6s0vxnk2ak55re90dz",
      litecoin: "LUWPbpM43E2p7ZSh8cyTBEkvpHmr3cB8Ez",
      zcash: "t1XVXWCvpMgBvUaed4XDqWtgQgJSu1Ghz7F",
    };
    for (const c of COINS)
      if (expected[c.coin] !== undefined) expect(addressOf(c, 0), c.coin).toBe(expected[c.coin]);
  });
});

describe("AUD-023 coin-address evidence through the Bitcoin edition's recognition", () => {
  const recognition = new BitcoinRecognition(webCryptoPbkdf2);
  const check = (evidence: WalletEvidence, passphrase = "") =>
    recognition.checkFor({ evidence, passphrase });

  it("offers exactly the eleven coins other than Bitcoin", () => {
    expect(BitcoinRecognition.COINS.map((c) => c.id).sort()).toEqual(
      COINS.map((c) => c.coin).sort(),
    );
  });

  for (const c of COINS) {
    it(`${c.coin}: first address, an address within the count, passphrase, other phrase`, async () => {
      const first = addressOf(c, 0);
      const seventh = addressOf(c, 7);
      const matchFirst = await check(coinEvidence(c.coin, first))(PHRASE);
      expect(matchFirst.matched).toBe(true);
      expect(matchFirst.path).toBe(pathOf(c.coinType, 0));
      // Index 7, compared from index 0 among the default 20: found; among 7 (0..6): not.
      const within = await check(coinEvidence(c.coin, seventh, 0, 20))(PHRASE);
      expect(within).toMatchObject({ matched: true, path: pathOf(c.coinType, 7) });
      expect((await check(coinEvidence(c.coin, seventh, 0, 7))(PHRASE)).matched).toBe(false);
      expect((await check(coinEvidence(c.coin, seventh, 7, 1))(PHRASE)).matched).toBe(true);
      expect((await check(coinEvidence(c.coin, first))(OTHER)).matched).toBe(false);
      // The BIP39 passphrase is used: the empty-passphrase address no longer matches, the
      // TREZOR wallet's own first address does.
      expect((await check(coinEvidence(c.coin, first), PASSPHRASE)(PHRASE)).matched).toBe(false);
      const withPassphrase = addressOf(c, 0, PASSPHRASE);
      expect(withPassphrase).not.toBe(first);
      expect((await check(coinEvidence(c.coin, withPassphrase), PASSPHRASE)(PHRASE)).matched).toBe(
        true,
      );
    });
  }

  it("Bitcoin addresses of every profile through 'Every type' with the default count", async () => {
    for (const [path, value] of [
      ["m/44'/0'/0'/0/3", p2pkh([0x00], keyAt("m/44'/0'/0'/0/3"))],
      ["m/49'/0'/0'/0/3", p2shP2wpkh(0x05, keyAt("m/49'/0'/0'/0/3"))],
      ["m/84'/0'/0'/0/3", p2wpkh("bc", keyAt("m/84'/0'/0'/0/3"))],
    ] as const) {
      const evidence = {
        kind: "address",
        value,
        profiles: BitcoinRecognition.PROFILES,
        location: { network: "mainnet", account: 0, branch: 0, index: 0 },
        addresses: 20,
      } as unknown as WalletEvidence;
      expect(await check(evidence)(PHRASE)).toMatchObject({ matched: true, path });
      expect((await check(evidence, PASSPHRASE)(PHRASE)).matched).toBe(false);
    }
  });

  it("refuses a wrong coin and a malformed address, naming why, before any secret", () => {
    const litecoin = addressOf(
      COINS.find((c) => c.coin === "litecoin")!,
      0,
    );
    const refusals: [WalletEvidence, RegExp][] = [
      [coinEvidence("dogecoin", litecoin), /cannot be used|not/iu],
      [coinEvidence("ethereum", "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu"), /cannot be used/iu],
      [coinEvidence("dash", "XoJA8qE3N2Y3jMLEtZ3vcN42qseZ8LvFf6"), /checksum|format/iu],
      [coinEvidence("cosmos", "cosmos19rl4cm2hmr8afy4kldpxz3fka4jguq0auqdal5"), /cannot be used/iu],
      // A coin the build does not offer is refused by the Deriver before MnemoCode's own "Unknown
      // coin" since the remediation of AUD-023-BLD001.
      [
        coinEvidence("monero", "4AdUndXHHZ6cfufTMvppY6JwXNouMBzSkbLYfpAV5Usx"),
        /Unknown coin|does not compare addresses of monero/u,
      ],
    ];
    const messages: string[] = [];
    for (const [evidence, pattern] of refusals) {
      let message = "";
      try {
        BitcoinRecognition.assertEvidence(evidence);
      } catch (error) {
        message = (error as Error).message;
      }
      messages.push(message);
      expect(message, JSON.stringify(evidence)).toMatch(pattern);
    }
    console.log(`refusal messages:\n  ${messages.join("\n  ")}`);
  });
});

describe("AUD-023 address-count bounds in the library", () => {
  const bad = [0, -1, 1.5, 1001, 2 ** 53, Number.NaN, Number.POSITIVE_INFINITY, "20"];
  const dash = "XoJA8qE3N2Y3jMLEtZ3vcN42qseZ8LvFf5";

  it("the Bitcoin edition's assertEvidence refuses every bad count for coin and Bitcoin evidence", () => {
    for (const count of bad) {
      expect(() =>
        BitcoinRecognition.assertEvidence(coinEvidence("dash", dash, 0, count as number)),
      ).toThrow(/integer from 1 through 1000/u);
      const address = {
        kind: "address",
        value: "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu",
        profiles: ["native-segwit"],
        location: { network: "mainnet", account: 0, branch: 0, index: 0 },
        addresses: count,
      } as unknown as WalletEvidence;
      expect(() => BitcoinRecognition.assertEvidence(address)).toThrow(
        /integer from 1 through 1000/u,
      );
    }
    expect(() =>
      BitcoinRecognition.assertEvidence(coinEvidence("dash", dash, 0, 1000)),
    ).not.toThrow();
    expect(() => BitcoinRecognition.assertEvidence(coinEvidence("dash", dash, 0, 1))).not.toThrow();
  });

  it("records what the Dash edition's assertEvidence does with a bad count", async () => {
    const accepted: string[] = [];
    for (const count of bad) {
      try {
        DashRecognition.assertEvidence(coinEvidence("dash", dash, 0, count as number));
        accepted.push(String(count));
      } catch {
        // refused before the search, as the Bitcoin edition refuses it
      }
    }
    console.log(`Dash edition assertEvidence accepted counts: [${accepted.join(", ")}]`);
    // What then happens to a search: the first candidate's comparison refuses the count.
    const searches = new MnemoCodeSearches(new DashRecognition(webCryptoPbkdf2));
    let outcome: string;
    try {
      const result = await searches.words(
        {
          text: PHRASE.replace(/about$/u, "?"),
          kind: "unknown-words",
          wallet: { evidence: coinEvidence("dash", dash, 0, 0), passphrase: "" },
        },
        () => undefined,
        new AbortController().signal,
      );
      outcome = `completed: count ${result.count}, matched ${result.matched}`;
    } catch (error) {
      outcome = `threw: ${(error as Error).message}`;
    }
    console.log(`Dash edition search with count 0: ${outcome}`);
    // The library must refuse the count before the search, as the Bitcoin edition does.
    expect(accepted).toEqual([]);
  });

  it("the fingerprint-only edition refuses an address", () => {
    expect(() => FingerprintRecognition.assertEvidence(coinEvidence("dash", dash))).toThrow(
      /master fingerprint only/u,
    );
  });
});

describe("AUD-023 production search path", () => {
  it("finds the forgotten last word by each coin's address among the first 20", async () => {
    const searches = new MnemoCodeSearches(new BitcoinRecognition(webCryptoPbkdf2));
    for (const c of COINS) {
      const result = await searches.words(
        {
          text: PHRASE.replace(/about$/u, "?"),
          kind: "unknown-words",
          // The fifth address, so that the count, not only index 0, is exercised.
          wallet: { evidence: coinEvidence(c.coin, addressOf(c, 4)), passphrase: "" },
        },
        () => undefined,
        new AbortController().signal,
      );
      expect(result.count, c.coin).toBe(128);
      expect(result.matched, c.coin).toBe(1);
      const match = result.shown.find((row) => row.matched === true);
      expect(match?.phrase, c.coin).toBe(PHRASE);
      expect(match?.path, c.coin).toBe(pathOf(c.coinType, 4));
    }
  });

  // At the reviewed snapshot the page showed 100 of 128 (AUD-023-FUN001); since the remediation a
  // word search shows what MnemoCode's recover-word shows, up to MAX_SHOWN_CANDIDATES.
  it("shows every candidate of a word search up to MnemoCode's MAX_SHOWN_CANDIDATES", async () => {
    const searches = new MnemoCodeSearches(new BitcoinRecognition(webCryptoPbkdf2));
    const result = await searches.words(
      { text: PHRASE.replace(/about$/u, "?"), kind: "unknown-words" },
      () => undefined,
      new AbortController().signal,
    );
    console.log(
      `word search, one word forgotten: count ${result.count}, shown ${result.shown.length}; ` +
        `MnemoCode's recover-word shows up to MAX_SHOWN_CANDIDATES = ${MAX_SHOWN_CANDIDATES}`,
    );
    expect(result.count).toBe(128);
    expect(result.shown.length).toBe(Math.min(128, MAX_SHOWN_CANDIDATES));
  });
});
