import { pbkdf2Sync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DASH } from "../../recovery-mnemocode/source/core/coins/dash.js";
import { DASH_ADDRESS_SELF_TEST } from "../../recovery-mnemocode/source/core/coins/dash-self-test.js";
import type { Coin } from "../../recovery-mnemocode/source/core/coins/coin.js";
import type { SelfTestFeature } from "../../recovery-mnemocode/source/core/self-test-check.js";
import { WordCandidateSearch } from "../../recovery-mnemocode/source/core/candidates.js";
import {
  askWallet,
  FINGERPRINT_WARNING,
} from "../../recovery-mnemocode/source/core/wallet-check.js";
import { MnemoCodeWalletRecognition as BitcoinRecognition } from "../src/mnemocode-wallet-bitcoin.js";
import { MnemoCodeWalletRecognition as CoinsRecognition } from "../src/mnemocode-wallet-coins.js";

// The public BIP39 test phrase; its master fingerprint is 73c5da0a.
const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const OTHER = "legal winner thank year wave sausage worth useful legal winner thank yellow";
const OFFERED_COINS_MODULE = "../src/mnemocode-offered-coins.js";
const pbkdf2 = (password: string, salt: string, rounds: number, bytes: number): Uint8Array =>
  new Uint8Array(pbkdf2Sync(password, salt, rounds, bytes, "sha512"));
const fingerprint = (value: string) => ({
  evidence: { kind: "master-fingerprint" as const, value, network: "mainnet" as const },
  passphrase: "",
});

/**
 * The recognition of a build that offers only `coins`, as the build composes it: a generated list
 * of its own coins takes the place of mnemocode-offered-coins.ts.
 */
async function offering<Module>(
  module: string,
  coins: readonly Coin[],
  checks: readonly SelfTestFeature[],
): Promise<Module> {
  vi.resetModules();
  // After the reset, the build's modules load afresh, and MnemoCode accepts only coins of its own
  // module instance (CoinList): the mock gives the fresh Dash coin in place of the one above.
  vi.doMock(OFFERED_COINS_MODULE, async () => {
    const fresh = await import("../../recovery-mnemocode/source/core/coins/dash.js");
    return {
      OFFERED_COINS: coins.map((coin) => (coin.id === fresh.DASH.id ? fresh.DASH : coin)),
      OFFERED_COIN_CHECKS: checks,
    };
  });
  return (await import(module)) as Module;
}
const withoutBitcoin = async (coins: readonly Coin[], checks: readonly SelfTestFeature[]) =>
  (
    await offering<{ MnemoCodeWalletRecognition: typeof CoinsRecognition }>(
      "../src/mnemocode-wallet-coins.js",
      coins,
      checks,
    )
  ).MnemoCodeWalletRecognition;

afterEach(() => {
  vi.doUnmock(OFFERED_COINS_MODULE);
  vi.resetModules();
});

// The first Dash Core receiving address of the public test phrase, m/44'/5'/0'/0/0.
const dashAddress = (index: number, addresses?: number, coin: string = "dash") => ({
  evidence: {
    kind: "coin-address" as const,
    coin: coin as "dash",
    value: "XoJA8qE3N2Y3jMLEtZ3vcN42qseZ8LvFf5",
    location: { account: 0, branch: 0, index },
    ...(addresses === undefined ? {} : { addresses }),
  },
  passphrase: "",
});

describe("MnemoCode wallet recognition in the Deriver", () => {
  it("matches the master fingerprint in every edition", async () => {
    for (const Recognition of [
      BitcoinRecognition,
      CoinsRecognition,
      await withoutBitcoin([DASH], [DASH_ADDRESS_SELF_TEST]),
      await withoutBitcoin([], []),
    ]) {
      const check = new Recognition(pbkdf2).checkFor(fingerprint("73c5da0a"));
      expect((await check(PHRASE)).matched).toBe(true);
      expect((await check(OTHER)).matched).toBe(false);
    }
  });

  it("keeps the public match fields complete after library capture and worker transfer", async () => {
    const publicFingerprint = "73c5da0a";
    const checkedFields = { matched: true, path: "m", warning: FINGERPRINT_WARNING };
    for (const [Recognition, expected] of [
      [
        BitcoinRecognition,
        { ...checkedFields, kind: "master-fingerprint", derived: publicFingerprint },
      ],
      [CoinsRecognition, checkedFields],
    ] as const) {
      const check = new Recognition(pbkdf2).checkFor(fingerprint(publicFingerprint));
      const captured = await askWallet(check, PHRASE);
      // Bitcoin's evidence also carries public kind/derived fields; capture must not drop them.
      expect(structuredClone(captured)).toEqual(expected);
    }
  });

  it("preserves private-backed host getters and methods in a word-search result", async () => {
    const publicDerived = "public derived address fixture";
    class HostMatch {
      readonly #derived = publicDerived;

      constructor(readonly matched: boolean) {}

      get derived(): string {
        return this.#derived;
      }

      describe(): string {
        return this.#derived;
      }
    }
    const result = await WordCandidateSearch.parse(
      PHRASE.replace(/about$/u, "?"),
      "unknown-words",
    ).run({ walletCheck: (candidate) => new HostMatch(candidate === PHRASE) });
    const match = result.shown.find((row) => row.match?.matched)?.match;
    expect(match).toBeInstanceOf(HostMatch);
    expect(match?.derived).toBe(publicDerived);
    expect(match?.describe()).toBe(publicDerived);
  });

  it("offers every coin of MnemoCode's in the full build, Bitcoin through its own evidence", () => {
    expect(BitcoinRecognition.COINS.map((coin) => coin.id)).not.toContain("bitcoin");
    expect(BitcoinRecognition.COINS).toHaveLength(11);
    expect(CoinsRecognition.COINS).toHaveLength(12);
    expect(() =>
      BitcoinRecognition.assertEvidence(dashAddress(0, undefined, "nocoin").evidence),
    ).toThrow(/does not compare addresses of nocoin/u);
  });

  it("offers and checks only the build's own coins with Bitcoin and Dash (AUD-023-BLD001)", async () => {
    const { MnemoCodeWalletRecognition: Recognition } = await offering<{
      MnemoCodeWalletRecognition: typeof BitcoinRecognition;
    }>("../src/mnemocode-wallet-bitcoin.js", [DASH], [DASH_ADDRESS_SELF_TEST]);
    expect(Recognition.COINS.map((coin) => coin.id)).toEqual(["dash"]);
    expect(Recognition.SELF_TESTS).toContain(DASH_ADDRESS_SELF_TEST);
    expect(Recognition.SELF_TESTS).toHaveLength(2);
    expect(() => Recognition.assertEvidence(dashAddress(0).evidence)).not.toThrow();
    expect(() =>
      Recognition.assertEvidence(dashAddress(0, undefined, "ethereum").evidence),
    ).toThrow(/does not compare addresses of ethereum/u);
  });

  it("refuses evidence other than the fingerprint in a build that offers no coin", async () => {
    const Recognition = await withoutBitcoin([], []);
    const address = {
      evidence: {
        kind: "address" as const,
        value: "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu",
        profiles: ["native-segwit" as const],
        location: { network: "mainnet" as const, account: 0, branch: 0, index: 0 },
      },
      passphrase: "",
    };
    expect(() => new Recognition(pbkdf2).checkFor(address)).toThrow(/master fingerprint only/u);
    expect(() => new Recognition(pbkdf2).checkFor(dashAddress(0))).toThrow(
      /master fingerprint only/u,
    );
    expect(() => new BitcoinRecognition(pbkdf2).checkFor(address)).not.toThrow();
    expect(() => Recognition.assertEvidence(fingerprint("73c5da0").evidence)).toThrow();
  });

  it("matches a Dash address at its place, or among the addresses from an earlier one (with Dash)", async () => {
    const Recognition = await withoutBitcoin([DASH], [DASH_ADDRESS_SELF_TEST]);
    const recognition = new Recognition(pbkdf2);
    expect((await recognition.checkFor(dashAddress(0))(PHRASE)).matched).toBe(true);
    expect((await recognition.checkFor(dashAddress(0))(OTHER)).matched).toBe(false);
    // From index 1 on, the address at 0 is not among them, however many are compared.
    expect((await recognition.checkFor(dashAddress(1, 20))(PHRASE)).matched).toBe(false);
    expect(Recognition.COINS.map((coin) => coin.id)).toEqual(["dash"]);
    expect(Recognition.SELF_TESTS).toEqual([DASH_ADDRESS_SELF_TEST]);
  });

  it("refuses another coin, and a Dash address that no wallet can have, with Dash", async () => {
    const Recognition = await withoutBitcoin([DASH], [DASH_ADDRESS_SELF_TEST]);
    expect(() =>
      Recognition.assertEvidence(dashAddress(0, undefined, "litecoin").evidence),
    ).toThrow(/fingerprint or an address of Dash/u);
    const damaged = { ...dashAddress(0).evidence, value: "XoJA8qE3N2Y3jMLEtZ3vcN42qseZ8LvFf6" };
    expect(() => Recognition.assertEvidence(damaged)).toThrow();
  });

  // AUD-023-API002: what MnemoCode refuses is refused before a search starts.
  it("refuses a count of addresses that MnemoCode refuses, and one beside a fingerprint", async () => {
    const Recognition = await withoutBitcoin([DASH], [DASH_ADDRESS_SELF_TEST]);
    for (const count of [0, -1, 1.5, 1_001, Number.NaN])
      expect(() => Recognition.assertEvidence(dashAddress(0, count).evidence)).toThrow(
        /number of addresses compared/u,
      );
    expect(() => Recognition.assertEvidence(dashAddress(0, 1_000).evidence)).not.toThrow();
    const counted = { ...fingerprint("73c5da0a").evidence, addresses: 20 };
    expect(() => Recognition.assertEvidence(counted)).toThrow(/compared with several addresses/u);
  });
});
