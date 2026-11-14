// Zcash in the Wallet Matcher: zs1 addresses and the Sapling receivers of u1 unified addresses,
// found among the Deriver's own Sapling rows over the index range and then by the ownership test
// of each searched account's keys, at any diversifier index; t1 addresses as before. Values:
// zcash-android-wallet-sdk @1aaf2c4 TransparentTest.kt (its PHRASE and the unified address it
// asserts, whose Sapling receiver is the Sapling row at j = 1, and its declared zAddr), the unified
// addresses of zcash/zcash-test-vectors @78321be unified_address.json (test/fixtures), the oracle's
// "unordered" refusal (test/oracles/zcash_unified_oracle.py) and own values of "abandon … about"
// from test/oracles/zcash_sapling_oracle.py (own() and matcher()). Public test data only.
import { readFileSync } from "node:fs";
import { bech32, bech32m } from "@scure/base";
import { describe, expect, it, vi } from "vitest";
import { bytesToHex, hexToBytes } from "@ckd/core/crypto.js";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { getCoinAdapter } from "@ckd/coins/registry.js";
import { createCoinRegistry } from "@ckd/coins/registry-base.js";
import { getRuntimeCoinAdapter } from "@ckd/coins/runtime-registry.js";
import { DecodedUnified, f4Jumble } from "@ckd/coins/zcash/unified.js";
import { SaplingExtendedSpendingKey } from "../../coin-protocols/src/zip32-sapling.js";
import { findDerivedAddresses } from "../src/address-search.js";
import {
  WalletMatcherPlan,
  type MatcherPlanInput,
  type MatcherWorker,
} from "../src/matcher-plan.js";
import { detectMultiChainMatcherTargets } from "../src/matcher-targets-multichain.js";

const ABOUT = `${"abandon ".repeat(11)}about`;
const ANDROID_PHRASE =
  "deputy visa gentle among clean scout farm drive comfort patch skin salt ranch cool ramp warrior drink narrow normal lunch behind salt deal person";
/** The Android SDK's asserted unified address: P2PKH, Sapling (j = 1) and Orchard receivers. */
const ANDROID_UA =
  "u1t23erzgkn7c6c2jn66rspl4m45lg8rn3f7mn7le4yxk7693wr7sgx472jn95s00x8kx3hct5ej4tf76k59dfhsd809t7mzt9ldzw8f5083fw4xqvxfshl9u7ed2wyv6ypmzny0px0nvszslr5kr7fgk2zgfnlycddzqak4adsqjdzp76y7fl0k4ygamjr43t6rpxsf6xql8g20rdk0h";
const ANDROID_ZS = "zs1yc4sgtfwwzz6xfsy2xsradzr6m4aypgxhfw2vcn3hatrh5ryqsr08sgpemlg39vdh9kfupx20py";
/** "abandon … about", account 0: own values of the oracle at j = 0 and j = 3 (j = 2 has none). */
const OWN = {
  t1: "t1XVXWCvpMgBvUaed4XDqWtgQgJSu1Ghz7F",
  zs0: "zs188wzupg00tqs3y5reyjc758c6vhl8qm2kg4k43mcp533ytrdkwpy8xjdk3zqtek0ng0cv7f0nta",
  saplingOnly0:
    "u1rzu6upvddzeedfl66g2lykaturxws9xxjlc2vdz8hyu2n0qymcfjd4ufrgafp9kxpe8r20wpessjsjf6gpsre6chkvayj53gycuyr55r",
  withTransparent0:
    "u1jl6ww3ud2f6dsu5ekr5cf2myfputgz0s3tqt8ur8zesq3fs6vudh9xyne8p8yha2cd56kzlnrjunc822ue97shduwcnnhyfdlmnh2dzp7jnd0u70tedenafz036flat3jfc273rdj32",
  zs3: "zs1c2wlrsejawrdxcmz4sn84ms5myyhs59ez9dpjfjh5rf674hkpwfqgj8qy95q6euj6p82w33psvr",
  /** The Matcher's own values (the oracle's matcher()): j = 2^31 - 1, j = 2^31, and a forgery. */
  last: "zs198j9j768r6fzetaak6f824ww0a8qctjdfuepdnqdycuuqawgsgsvl2rpr9v67p502u62glumvrn",
  beyond: "zs1wqzggcepa7zfvjn2hjdnkzzlftd6548kmgqsjhfxzvnsrzlp6w8ykfvlt4qz5qh27rj6kttfl6s",
  forged: "zs1yjx25acnu8kzlhg2t63evmvess8l4g2565nl6g550ktp3pqa79ycgzu8ecydflluuw5vz5hczlh",
};
/** Every unified address of unified_address.json, with its Sapling receiver or null. */
const VECTORS = (
  JSON.parse(
    readFileSync(
      new URL("../../../test/fixtures/zcash-test-vectors/unified_address.json", import.meta.url),
      "utf8",
    ),
  ) as (string | number | null)[][]
)
  .slice(2)
  .map((row) => ({
    unified: String(row[6]),
    sapling: typeof row[2] === "string" ? hexToBytes(row[2]) : null,
  }));
/** unified_address.json: account 9 at j = 0, an Orchard receiver alone; account 3, P2PKH and Orchard. */
const ORCHARD_ONLY =
  "u1ddnjsdcpm36r6aq79n3s68shjweksnmwtdltrh046s8m6xcws9ygyawalxx8n6hg6vegk0wh8zjnafxgh6msppjsljvyt0ynece3lvm0";
const TRANSPARENT_AND_ORCHARD =
  "u1snf9yr883aj2hm8pksp9aymnqdwzy42rpzuffevj35hhxeckays5pcpeq7vy2mtgzlcuc4mnh9443qnuyje0yx6h59angywka4v2ap6kchh2j96ezf9w0c0auyz3wwts2lx5gmk2sk9";
/** The oracle's unified address whose typecodes are out of order. */
const UNORDERED =
  "u1rans3uu7cj0xyc7t7wfwqh65pau3aslpksy8jxpay5jf0q4cak9p4masfgl88tsnkh5nr9ly8cp29kv6q2qsdvxcjkc4x78540my82enpg4xv7zpwqeycwvcru38fq4eeqlv5dsfuz6";

const targetOf = (value: string, network: "mainnet" | "testnet" = "mainnet") =>
  detectMultiChainMatcherTargets(value, network, false)[0];

/** The raw Sapling receiver of a zs1 text, for texts built here. */
const rawOf = (zs: string): Uint8Array => bech32.decodeToBytes(zs).bytes;

/** A testnet unified address of a Sapling receiver alone (ZIP-316: HRP "utest", its padding). */
function testnetUnified(raw: Uint8Array): string {
  const padding = new Uint8Array(16);
  padding.set(new TextEncoder().encode("utest"));
  const items = Uint8Array.of(0x02, raw.length, ...raw, ...padding);
  return bech32m.encode("utest", bech32m.toWords(f4Jumble(items)), false);
}

describe("Zcash's addresses in the Wallet Matcher's targets", () => {
  it("reads a t1 address under the transparent variant, as before", () => {
    expect(targetOf(OWN.t1)).toEqual({
      id: "address-1",
      input: OWN.t1,
      network: "mainnet",
      normalized: OWN.t1,
      adapterIds: ["zcash"],
    });
  });

  it("reads a zs1 address, and the Sapling receiver of a u1 address, under the Sapling variant", () => {
    for (const [value, normalized] of [
      [OWN.zs0, OWN.zs0],
      [OWN.zs0.toUpperCase(), OWN.zs0],
      [OWN.saplingOnly0, OWN.zs0],
      // A transparent receiver beside it changes nothing: the Sapling receiver is searched.
      [OWN.withTransparent0, OWN.zs0],
      // P2PKH, Sapling and Orchard receivers: the Sapling one.
      [ANDROID_UA, ANDROID_ZS],
    ] as const)
      expect(targetOf(value)).toMatchObject({
        input: value,
        normalized,
        adapterIds: ["zcash-sapling"],
        ownership: true,
      });
    // A search of every coin keeps the Sapling variant alone: no other row shows a zs1 address.
    expect(detectMultiChainMatcherTargets(ANDROID_UA, "mainnet", true)[0]?.adapterIds).toEqual([
      "zcash-sapling",
    ]);
  });

  it("refuses a unified address without a Sapling receiver, naming its line", () => {
    for (const address of [ORCHARD_ONLY, TRANSPARENT_AND_ORCHARD])
      expect(() =>
        detectMultiChainMatcherTargets(`${OWN.t1}\n${address}`, "mainnet", false),
      ).toThrow(
        "Address 2: a unified address with an Orchard receiver and no Sapling receiver, which cannot be searched: Orchard keys are not derived here.",
      );
  });

  it("reads every unified address of the vectors, up to 509 characters, and refuses a longer line", () => {
    // Each refused for its lack of a Sapling receiver, or read as it: none is too long.
    for (const { unified, sapling } of VECTORS) {
      const target = (): unknown => targetOf(unified);
      if (sapling === null)
        expect(target).toThrow(/^Address 1: a unified address with an Orchard/u);
      else
        expect(target()).toMatchObject({
          normalized: bech32.encode("zs", bech32.toWords(sapling), false),
        });
    }
    expect(Math.max(...VECTORS.map(({ unified }) => unified.length))).toBe(509);
    expect(() => targetOf(`u1${"q".repeat(511)}`)).toThrow(/longer than any supported address/u);
  });

  it("refuses a unified address that ZIP-316 refuses, and a malformed zs1 address, naming the line", () => {
    expect(() => targetOf(UNORDERED)).toThrow(
      "Address 1: The items of a unified encoding come in ascending order of typecode (ZIP-316).",
    );
    // A zs1 text of the wrong length is refused as it is read; one whose pk_d is no point (0xff…)
    // by its check, which the plan makes in its turns (the point checks cost milliseconds).
    const raw = rawOf(OWN.zs0);
    const malformed =
      "Address 2: a malformed Sapling address: its bytes are no diversifier and transmission key of an address.";
    const text = (bytes: Uint8Array) => bech32.encode("zs", bech32.toWords(bytes), false);
    expect(() =>
      detectMultiChainMatcherTargets(`${OWN.t1}\n${text(raw.subarray(0, 42))}`, "mainnet", false),
    ).toThrow(malformed);
    const late = detectMultiChainMatcherTargets(
      `${OWN.t1}\n${text(Uint8Array.of(...raw.subarray(0, 11), ...new Uint8Array(32).fill(0xff)))}`,
      "mainnet",
      false,
    )[1];
    expect(late?.check).toBeTypeOf("function");
    expect(() => late?.check?.()).toThrow(malformed);
    // The valid receivers pass theirs.
    for (const value of [OWN.zs0, OWN.saplingOnly0, ANDROID_UA])
      expect(() => targetOf(value)?.check?.()).not.toThrow();
  });

  it("reads at most 1,000 address lines", () => {
    const lines = (count: number) => Array.from({ length: count }, () => OWN.t1).join("\n");
    expect(() => targetOf(lines(1001))).toThrow("Enter at most 1,000 known addresses.");
    expect(() => targetOf(lines(1000))).toThrow("Address 2 duplicates an earlier address.");
  });

  it("recognizes no testnet text, no mixed case and no broken checksum", () => {
    const raw = rawOf(OWN.zs0);
    for (const [value, network] of [
      [OWN.zs0, "testnet"],
      [OWN.saplingOnly0, "testnet"],
      [bech32.encode("ztestsapling", bech32.toWords(raw), false), "mainnet"],
      [testnetUnified(raw), "mainnet"],
      [`${OWN.zs0.slice(0, 40)}${OWN.zs0.slice(40).toUpperCase()}`, "mainnet"],
      [`${OWN.zs0.slice(0, -1)}q`, "mainnet"],
      [`${OWN.saplingOnly0.slice(0, -1)}q`, "mainnet"],
    ] as const)
      expect(() => targetOf(value, network)).toThrow(/not recognized/u);
  });
});

/** The Sapling variant's rows and ownership test, as the worker runs them. */
const WORKER: MatcherWorker = {
  searchMany: (adapterId, base, requests, start, count) =>
    findDerivedAddresses(getRuntimeCoinAdapter(adapterId), base, requests, start, count),
  derive: async (adapterId, request) => await getRuntimeCoinAdapter(adapterId).derive(request),
};

function input(overrides: Partial<MatcherPlanInput> = {}): MatcherPlanInput {
  return {
    source: { kind: "lists", phrases: `${ABOUT}\n${ANDROID_PHRASE}`, passphrases: "" },
    targets: [OWN.withTransparent0, ANDROID_UA, OWN.zs3].join("\n"),
    network: "mainnet",
    coin: "zcash",
    allCoins: false,
    change: false,
    accountStart: 0,
    accountEnd: 0,
    indexStart: 0,
    indexCount: 2,
    ...overrides,
  };
}

const SERVICES = {
  registry: createCoinRegistry([getCoinAdapter("zcash"), getCoinAdapter("zcash-sapling")]),
  detectTargets: detectMultiChainMatcherTargets,
  mnemonicToSeed,
};

describe("Zcash's Sapling variant in the Wallet Matcher", () => {
  it("finds a receiver among the rows of the range, and one past the range by the account's keys", async () => {
    using plan = new WalletMatcherPlan(input(), SERVICES);
    const outcome = await plan.search(
      WORKER,
      () => true,
      () => undefined,
      async () => undefined,
    );
    if (outcome.kind !== "complete") throw new Error("The search must complete.");
    // Rows j = 0 and 1 hold the first two; j = 3 of "abandon … about" is past them.
    expect(
      outcome.findings.map(({ seedNumber, addressNumber, adapterId, index, path }) => [
        seedNumber,
        addressNumber,
        adapterId,
        index,
        path,
      ]),
    ).toEqual([
      [1, 1, "zcash-sapling", 0, "m/32'/133'/0' · diversifier index 0"],
      [1, 3, "zcash-sapling", 3, "m/32'/133'/0' · diversifier index 3"],
      [2, 2, "zcash-sapling", 1, "m/32'/133'/0' · diversifier index 1"],
    ]);
    // The reveal re-derives the row of each, and gives the account's keys that the Sapling variant
    // names (accountKeyFields), which a row has not.
    const secrets = await plan.privateValues(outcome.findings, WORKER, () => true);
    expect(secrets?.size).toBe(3);
    const fields = secrets?.fields(1) ?? [];
    expect(fields.map(({ key }) => key)).toEqual([
      "unifiedFullViewingKey",
      "saplingFullViewingKey",
      "unifiedIncomingViewingKey",
      "saplingSpendingKey",
    ]);
    expect(fields.find(({ key }) => key === "saplingSpendingKey")?.value).toMatch(
      /^secret-extended-key-main1/u,
    );
    secrets?.wipe();
  });

  it("refuses a malformed receiver while its checks are made, before any seed, naming its line", async () => {
    const raw = rawOf(OWN.zs0);
    const forgedPoint = Uint8Array.of(...raw.subarray(0, 11), ...new Uint8Array(32).fill(0xff));
    const seed = vi.fn(mnemonicToSeed);
    using plan = new WalletMatcherPlan(
      input({
        targets: [OWN.zs3, bech32.encode("zs", bech32.toWords(forgedPoint), false)].join("\n"),
      }),
      { ...SERVICES, mnemonicToSeed: seed },
    );
    const stages: string[] = [];
    await expect(
      plan.search(
        WORKER,
        () => true,
        ({ stage, completed, total }) => stages.push(`${stage} ${completed}/${total}`),
        async () => undefined,
      ),
    ).rejects.toThrow("Address 2: a malformed Sapling address");
    expect(stages).toEqual(["addresses 0/2"]);
    expect(seed).not.toHaveBeenCalled();
  });

  it("finds an owned address up to the rows' last index, 2^31 - 1, and none past it", async () => {
    using plan = new WalletMatcherPlan(
      input({
        source: { kind: "lists", phrases: ABOUT, passphrases: "" },
        targets: [OWN.last, OWN.beyond].join("\n"),
      }),
      SERVICES,
    );
    const outcome = await plan.search(
      WORKER,
      () => true,
      () => undefined,
      async () => undefined,
    );
    if (outcome.kind !== "complete") throw new Error("The search must complete.");
    expect(outcome.findings.map(({ addressNumber, index }) => [addressNumber, index])).toEqual([
      [1, 2 ** 31 - 1],
    ]);
  });

  it("finds no forged address: the account's diversifier with another key's transmission key", async () => {
    // d of "abandon … about"'s account 0 at j = 7, whose FF1 decryption under that account's dk
    // is 7; but pk_d is the Android phrase's ivk times DiversifyHash(d), so that account owns it,
    // at an index past 2^31 - 1 under its own dk, and this one does not.
    const master = SaplingExtendedSpendingKey.fromSeed(mnemonicToSeed(ABOUT, ""));
    const key = master.deriveHardened([32, 133, 0]);
    master.wipe();
    try {
      const forged = rawOf(OWN.forged);
      expect(bytesToHex(forged.subarray(0, 11))).toBe(
        bytesToHex(key.addressAt(7n)?.diversifier ?? new Uint8Array(0)),
      );
      expect(key.diversifierIndexOf(forged.subarray(0, 11))).toBe(7n);
      expect(key.ownsAddress(forged)).toBe(false);
    } finally {
      key.wipe();
    }
    using plan = new WalletMatcherPlan(input({ targets: OWN.forged, indexCount: 1 }), SERVICES);
    expect(
      await plan.search(
        WORKER,
        () => true,
        () => undefined,
        async () => undefined,
      ),
    ).toEqual({ kind: "complete", findings: [] });
  });
});

describe("Zcash's Sapling ownership test in the Wallet Matcher", () => {
  it("finds by ownership only the account that owns the receiver", async () => {
    // Account 1 of "abandon … about" owns none of account 0's receivers.
    using plan = new WalletMatcherPlan(
      input({
        source: { kind: "lists", phrases: ABOUT, passphrases: "" },
        targets: OWN.zs3,
        accountStart: 1,
        accountEnd: 1,
      }),
      SERVICES,
    );
    expect(
      await plan.search(
        WORKER,
        () => true,
        () => undefined,
        async () => undefined,
      ),
    ).toEqual({ kind: "complete", findings: [] });
  });

  it("tests by ownership only a request that asks for it, and only under an adapter that has one", async () => {
    const base = {
      seed: mnemonicToSeed(ABOUT, ""),
      network: "mainnet",
      account: 0,
      branch: 0,
    } as const;
    const request = { id: "address-1", address: OWN.zs3 };
    const sapling = getRuntimeCoinAdapter("zcash-sapling");
    expect(await findDerivedAddresses(sapling, base, [request], 0, 1)).toEqual([]);
    expect(
      await findDerivedAddresses(sapling, base, [{ ...request, ownership: true }], 0, 1),
    ).toEqual([
      { id: "address-1", index: 3, path: "m/32'/133'/0' · diversifier index 3", address: OWN.zs3 },
    ]);
    expect(
      await findDerivedAddresses(
        getRuntimeCoinAdapter("zcash"),
        base,
        [{ ...request, ownership: true }],
        0,
        1,
      ),
    ).toEqual([]);
    expect(base.seed.some((byte) => byte !== 0)).toBe(true);
  });

  it("hands the ownership test its own copy of the seed, wipes it, and wipes the account's keys", async () => {
    const seeds: Uint8Array[] = [];
    const sapling = getRuntimeCoinAdapter("zcash-sapling");
    const adapter = {
      ...sapling,
      ownedAddresses: (
        input: Parameters<NonNullable<typeof sapling.ownedAddresses>>[0],
        addresses: readonly string[],
      ) => {
        seeds.push(input.seed);
        return sapling.ownedAddresses?.(input, addresses) ?? [];
      },
    };
    const deriveHardened = vi.spyOn(SaplingExtendedSpendingKey.prototype, "deriveHardened");
    const base = {
      seed: mnemonicToSeed(ABOUT, ""),
      network: "mainnet",
      account: 0,
      branch: 0,
    } as const;
    const found = await findDerivedAddresses(
      adapter,
      base,
      [
        { id: "address-1", address: OWN.zs3, ownership: true },
        { id: "address-2", address: OWN.last, ownership: true },
      ],
      0,
      1,
    );
    expect(found.map(({ id, index }) => [id, index])).toEqual([
      ["address-1", 3],
      ["address-2", 2 ** 31 - 1],
    ]);
    // One copy for both addresses, wiped; the caller's seed is left as it was.
    expect(seeds).toHaveLength(1);
    expect(seeds[0]).not.toBe(base.seed);
    expect(seeds[0]?.every((byte) => byte === 0)).toBe(true);
    expect(base.seed.some((byte) => byte !== 0)).toBe(true);
    // The account's key, derived once for both, is wiped (and its master, by deriveHardened's rule).
    const keys = deriveHardened.mock.results.map(
      ({ value }) => value as SaplingExtendedSpendingKey,
    );
    // One account key for the row of the range, and one for both ownership tests.
    expect(keys).toHaveLength(2);
    for (const key of keys)
      expect(() => key.bytes()).toThrow(expect.objectContaining({ code: "sapling.key.wiped" }));
    deriveHardened.mockRestore();
  });

  it("wipes the unified address it decodes, read or refused", () => {
    const wipe = vi.spyOn(DecodedUnified.prototype, "wipe");
    targetOf(ANDROID_UA);
    expect(() => targetOf(ORCHARD_ONLY)).toThrow(/Orchard/u);
    expect(wipe).toHaveBeenCalledTimes(2);
    wipe.mockRestore();
  });
});
