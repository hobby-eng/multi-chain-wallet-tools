// Zcash's Sapling rows (coins/zcash/sapling.ts) against published values and own ones.
// - zcash/zcash-test-vectors @78321be (test/fixtures/zcash-test-vectors): every unified address,
//   UFVK and UIVK of seed bytes(range(32)) that holds only the items a row writes.
// - zcash-swift-wallet-sdk @01eb750 Tests/OfflineTests/DerivationToolTests/
//   DerivationToolMainnetTests.swift: the UFVK of its seedData (L14), asserted by
//   testDeriveViewingKeysFromSeed (L51-58); its zxviews and zs1 (L41-46) are declared there but not
//   asserted.
// - zcash-android-wallet-sdk @1aaf2c4 sdk-lib/src/androidTest/java/cash/z/ecc/android/sdk/jni/
//   TransparentTest.kt: the unified address of its PHRASE (L49-51, ExpectedMainnet.uAddr L59),
//   asserted by deriveUnifiedFullViewingKeysFromSeedTest (L28-46); its zAddr (L58) is not asserted.
// - Own values of the public "abandon … about" phrase, from test/oracles/zcash_sapling_oracle.py,
//   which first reproduces every published value above and S1's and S2's vectors.
// Public test data only.
import { describe, expect, it } from "vitest";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { hexToBytes } from "@ckd/core/crypto.js";
import { clearDerivationResult } from "@ckd/core/secrets.js";
import type { DerivationResult, DerivedRow } from "@ckd/core/types.js";
import { ZCASH_COIN_ADAPTERS } from "../src/coins/adapters/zcash.js";
import { zcashDerivation } from "../src/coins/zcash/index.js";
import { zcashTransparentAddress } from "../src/coins/zcash/transparent.js";
import { decodeUnified } from "../src/coins/zcash/unified.js";
import { ZCASH_UNORDERED_ADDRESS } from "../../verification/src/derivation-self-test-zcash.js";
import { own, rows, textOf } from "./zcash-unified-fixtures.js";

/** The BIP39 seed of "abandon abandon … about" without a passphrase (BIP39's first vector). */
const ABANDON_ABOUT =
  "5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc1" +
  "9a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4";
/** The seed of zcash-test-vectors' generators: bytes(range(32)). */
const VECTOR_SEED = Uint8Array.from({ length: 32 }, (_, at) => at);
/** zcash-swift-wallet-sdk's seedData (base64) and the UFVK it asserts for account 0. */
const SWIFT_SEED =
  "9VDVOZZZOWWHpZtq1Ebridp3Qeux5C+HwiRR0g7Oi7HgnMs8Gfln83+/Q1NnvClcaSwM4ADFL1uZHxypEWlWXg==";
const SWIFT_UFVK =
  "uview17fme6ux853km45g9ep07djpfzeydxxgm22xpmr7arzxyutlusalgpqlx7suga4ahzywfuwz4jclm00u7g8u65qvvdt45kttnfunvschssg3h3g06txs9ja32vx3xa8dej3unnat" +
  "gzjvd0vumk37t8es3ludldrtse3q6226ws7eq4q0ywz78nudwpepgdn7jmxz8yvp7k6gxkeynkam0f8aqf9qpeaej55zhkw39x7epayhndul0j4xjttdxxlnwcd09nr8svyx8j0zng0w6" +
  "scx3m5unpkaqxcm3hslhlfg4caz7r8d4xy9wm7klkg79w7j0uyzec5s3yje20eg946r6rmkf532nfydu26s8q9ua7mwxw2j2ag7hfcuu652gw6uta03vlm05zju3a9rwc4h367kqzfqrc" +
  "z35pdwdk2a7yqnk850un3ujxcvve45ueajgvtr6dj4ufszgqwdy0aedgmkalx2p7qed2suarwkr35dl0c8dnqp3";
/** The same SDK's declared, not asserted, zxviews and zs1 of that account. */
const SWIFT_ZXVIEWS =
  "zxviews1qw28psv0qqqqpqr2ru0kss5equx6h0xjsuk5299xrsgdqnhe0cknkl8uqff34prwkysswfhjk79n8l99f2grd26dqg6dy3jcmxsaypxfsu6ara6vsk3x8l544uaksstx9zre879md" +
  "g7s9a7zurrx6pf5qg2n323js2s3zlu8tn3848yyvlg4w38gx75cyv9jdpve77x9eq6rtl6d9qyh8det4edevlnc70tg5kse670x50764gzhy60dta0yv3wsd4fsuaz686lgszcq7kwxy";
const SWIFT_ZS = "zs1vp7kvlqr4n9gpehztr76lcn6skkss9p8keqs3nv8avkdtjrcctrvmk9a7u494kluv756jeee5k0";
/** zcash-android-wallet-sdk's PHRASE, the unified address it asserts and its declared zAddr. */
const ANDROID_PHRASE =
  "deputy visa gentle among clean scout farm drive comfort patch skin salt ranch cool ramp warrior drink narrow normal lunch behind salt deal person";
const ANDROID_UA =
  "u1t23erzgkn7c6c2jn66rspl4m45lg8rn3f7mn7le4yxk7693wr7sgx472jn95s00x8kx3hct5ej4tf76k59dfhsd809t7mzt9ldzw8f5083fw4xqvxfshl9u7ed2wyv6ypmzny0px0nvszslr5kr7fgk2zgfnlycddzqak4adsqjdzp76y7fl0k4ygamjr43t6rpxsf6xql8g20rdk0h";
const ANDROID_ZS = "zs1yc4sgtfwwzz6xfsy2xsradzr6m4aypgxhfw2vcn3hatrh5ryqsr08sgpemlg39vdh9kfupx20py";

// Own values: "abandon … about", account 0, rows j = 0 to 3 (null: no Sapling address) and the
// summary, from test/oracles/zcash_sapling_oracle.py.
const OWN_ROWS: Readonly<Record<number, Readonly<Record<string, string>> | null>> = {
  0: {
    address: "zs188wzupg00tqs3y5reyjc758c6vhl8qm2kg4k43mcp533ytrdkwpy8xjdk3zqtek0ng0cv7f0nta",
    unifiedAddress:
      "u1rzu6upvddzeedfl66g2lykaturxws9xxjlc2vdz8hyu2n0qymcfjd4ufrgafp9kxpe8r20wpessjsjf6gpsre6chkvayj53gycuyr55r",
    unifiedTransparentAddress:
      "u1jl6ww3ud2f6dsu5ekr5cf2myfputgz0s3tqt8ur8zesq3fs6vudh9xyne8p8yha2cd56kzlnrjunc822ue97shduwcnnhyfdlmnh2dzp7jnd0u70tedenafz036flat3jfc273rdj32",
    transparentReceiver: "t1XVXWCvpMgBvUaed4XDqWtgQgJSu1Ghz7F",
    diversifier: "39dc2e050f7ac1089283c9",
  },
  1: {
    address: "zs18mf5cfxk86548936crvphcfsfemgq20j67sgdgn9wu465hgwy8n3jmavx55pmezxkutrj98kjqf",
    unifiedAddress:
      "u1k52dmgg6wt2vavju2f7latk9808h9t6a5teeyex7ndadz2j4utpk0w4zdlnd4t6dpe9jdpvfredp37hx8493ccdf49fdc940ygrwhcwn",
    unifiedTransparentAddress:
      "u1503wmgy5rgyqd4kdumd353qu6hycvx6kzsg0d5u29gynxcz083l7yfayexqj8c568pz46d0svvn2m8x4pjk0crw06zdwh3m3t87gtq5y6yfk0fznqknmnygqgnujc5v3f2yvj0c3e27",
    transparentReceiver: "t1aQ2b1XszNVo15BguYLbQGqETBL9QZA8Jq",
    diversifier: "3ed34c24d63ea953963ac0",
  },
  2: null,
  3: {
    address: "zs1c2wlrsejawrdxcmz4sn84ms5myyhs59ez9dpjfjh5rf674hkpwfqgj8qy95q6euj6p82w33psvr",
    unifiedAddress:
      "u1tugn8hee4xku237444radlr7ptz5fs8t7cqcpzcmvvxan5ts835ah62nvs9jn4pxaamgn966v9mgfdepldqzr36334kxm4naxsvqll73",
    unifiedTransparentAddress:
      "u1l6cnsly2vzfjhjfnmg904qakqp9yjw2scjmvy3lj34954eztny02d2erkw3t8k0nc75d9v2j8g8uhtx6e8ealhdm9gujzwmhrzwzufl8ag0pwujzq7dckpv6e8k6udcu9v8uzpf7apz",
    transparentReceiver: "t1M4FWL2VYmWy5qEuPUHrhEEcxsdkZ79xYn",
    diversifier: "c29df1c332eb86d36362ac",
  },
};
const OWN_SUMMARY: Readonly<Record<string, string>> = {
  unifiedFullViewingKey:
    "uview1ug8krfwhlae5gs222wu5skekpjarn7garssal4zldex6dkdhgespjcq0cdf53j5y066mv6lnkznv2u3gke2vjxv9m5aq4tsu33wh2y3xuqu9evkmh4z0a3xgjgqxfh09qv7jq3mdf0j3dcyn0tckxgjtfmhrv3f2z7ap9ngjzzglla2x6hz6p9ln7g2hsljpk6aaafmut65sj2ma9d38t2ryn0cntapgrg5m4d24mcs6wa8ty6z0zzhsupr2vmpmfe7x2ng0ujplthjzw2ydllzmfw9rrmrqttlwl50gs4as8k9r06yxwkw3v0v72lpagxq2efjjz0ejy65tnpwd6g7wlux",
  saplingFullViewingKey:
    "zxviews1q00pkhghqqqqpqpjr7aphsx37860r2y85wfgq66meql6jw69ls69aztxjhq8cmnjd5k8kq2gx555yanx7mv0hsgyw8nn4dmsl44afssw5whnkfqxrgcs343rpv59a97w4320fa3m6jderp4y8rhywd3edkvqetmt9wtde7yx0se3lftqty8gvymk3097nzt4mdy34ftxea0yfwg84tgmyjckvpngs4zkwfleqwvd9n870zkjgt5d5s4uxyqcwsh8t298lgl5vf95g9qw2wx7h",
  unifiedIncomingViewingKey:
    "uivk1lsy9eyhhrm7s6sl283xle9z6k7e072jsaurtwxyhhd0937wq6v92gfm86pc53y0es4nrq0jj9w6rhytfxf4kcz34ngt3xunt706plxclnf9tyt6r36em9y7m3fuf4gt80vdp4nnw6f43jgke4wxjcxkwlzdqlk6z9r8actg5sjjj0h8vxnmqjgauffac6ev2p6ae0q7r0peyckp70yt4se8mxj3td3sygk7lusc3xam0tnqzlq8u7",
  saplingSpendingKey:
    "secret-extended-key-main1q00pkhghqqqqpqpjr7aphsx37860r2y85wfgq66meql6jw69ls69aztxjhq8cmnjdhc9v7jnk3utf4g66ddp6cll6fw0vqthr9vnczdjqkxyelkjxgtq2a5g5w6ngqj4rnewvnf3ehh7fzftv4jpkgzrtv4jqjej6zdge4gr0se3lftqty8gvymk3097nzt4mdy34ftxea0yfwg84tgmyjckvpngs4zkwfleqwvd9n870zkjgt5d5s4uxyqcwsh8t298lgl5vf95g9qdtz6vv",
};

/** The Sapling result of `seed` for `account` and the rows from `start`, which the caller clears. */
function sapling(
  seed: Uint8Array,
  account: number,
  start: number,
  count: number,
): DerivationResult {
  const derive = zcashDerivation("zcash-sapling");
  if (derive === undefined) throw new Error("Zcash's Sapling variant is not derived.");
  return derive({ seed: seed.slice(), network: "mainnet", account, branch: 0, start, count });
}

/** `read` of a Sapling result, which is cleared afterwards. */
function withResult<T>(
  seed: Uint8Array,
  input: { account: number; start: number; count: number },
  read: (result: DerivationResult) => T,
): T {
  const result = sapling(seed, input.account, input.start, input.count);
  try {
    return read(result);
  } finally {
    clearDerivationResult(result);
  }
}

/** The public fields of a row, by key. */
function fieldsOf(row: DerivedRow | undefined): Record<string, string> {
  if (row === undefined) throw new Error("No such row.");
  return Object.fromEntries([...row.basic, ...row.advanced].map(({ key, value }) => [key, value]));
}

/** A summary field's value. */
function summaryValue(result: DerivationResult, key: string): string {
  const found = [...result.basicSummary, ...result.summary].find((field) => field.key === key);
  if (found === undefined) throw new Error(`No summary field ${key}.`);
  return found.value;
}

describe("Zcash's Sapling rows", () => {
  it("give the own values of abandon … about, row by index, with no address at j = 2", () => {
    withResult(hexToBytes(ABANDON_ABOUT), { account: 0, start: 0, count: 4 }, (result) => {
      expect(result.rows.map(({ index }) => index)).toEqual([0, 1, 2, 3]);
      for (const row of result.rows) {
        const own = OWN_ROWS[row.index];
        const fields = fieldsOf(row);
        expect(fields.diversifierIndex).toBe(String(row.index));
        expect(fields.path).toBe(`m/32'/133'/0' · diversifier index ${row.index}`);
        if (own === null || own === undefined) {
          expect(row.basic).toEqual([]);
          expect(Object.keys(fields)).toEqual(["path", "diversifierIndex"]);
          expect(row.title).toBe(`Index #${row.index} · no Sapling address`);
          expect(row.note).toBe(
            "No Sapling address at this index: its diversifier is not valid (ZIP-32), and wallets skip it.",
          );
        } else {
          expect(row.note).toBeUndefined();
          for (const [key, value] of Object.entries(own))
            expect([key, fields[key]]).toEqual([key, value]);
        }
      }
      for (const [key, value] of Object.entries(OWN_SUMMARY))
        expect([key, summaryValue(result, key)]).toEqual([key, value]);
    });
  });

  it("show the transparent tab's address #0 as the transparent receiver of j = 0", () => {
    // packages/verification/src/derivation-self-test-zcash.ts: the transparent tab's first address.
    withResult(hexToBytes(ABANDON_ABOUT), { account: 0, start: 0, count: 1 }, (result) => {
      expect(fieldsOf(result.rows[0]).transparentReceiver).toBe(
        "t1XVXWCvpMgBvUaed4XDqWtgQgJSu1Ghz7F",
      );
    });
  });

  it("give the same rows in batches as at once, as the page's batches ask for them", () => {
    const seed = hexToBytes(ABANDON_ABOUT);
    const whole = withResult(seed, { account: 0, start: 0, count: 6 }, (result) =>
      result.rows.map(fieldsOf),
    );
    const parts = [0, 2, 4].flatMap((start) =>
      withResult(seed, { account: 0, start, count: 2 }, (result) => result.rows.map(fieldsOf)),
    );
    expect(parts).toEqual(whole);
  });
});

describe("published unified encodings through the Sapling rows", () => {
  it.each(
    rows("unified_address").filter(
      (row) =>
        row.sapling_raw_addr !== null &&
        row.orchard_raw_addr === null &&
        row.unknown_bytes === null,
    ),
  )("give unified_address.json's text of account $account at j = $diversifier_index", (row) => {
    const j = Number(row.diversifier_index);
    const field = row.p2pkh_bytes === null ? "unifiedAddress" : "unifiedTransparentAddress";
    withResult(VECTOR_SEED, { account: Number(row.account), start: j, count: 1 }, (result) => {
      expect(fieldsOf(result.rows[0])[field]).toBe(textOf(row, "unified_addr"));
    });
  });

  it.each(
    [
      ["unified_full_viewing_keys", "unifiedFullViewingKey", "unified_fvk", "unknown_fvk_bytes"],
      [
        "unified_incoming_viewing_keys",
        "unifiedIncomingViewingKey",
        "unified_ivk",
        "unknown_ivk_bytes",
      ],
    ].flatMap(([file, field, text, unknown]) =>
      rows(file ?? "")
        .filter(
          (row) =>
            row.t_key_bytes !== null &&
            row[`sapling_${file === "unified_full_viewing_keys" ? "fvk" : "ivk"}_bytes`] !== null &&
            row[`orchard_${file === "unified_full_viewing_keys" ? "fvk" : "ivk"}_bytes`] === null &&
            row[unknown ?? ""] === null,
        )
        .map((row) => ({
          file,
          field: field ?? "",
          text: textOf(row, text ?? ""),
          account: Number(row.account),
        })),
    ),
  )("give $file's text of account $account", ({ field, text, account }) => {
    withResult(VECTOR_SEED, { account, start: 0, count: 1 }, (result) => {
      expect(summaryValue(result, field)).toBe(text);
    });
  });
});

describe("the wallet SDKs' asserted values", () => {
  it("give the Sapling and P2PKH items of the UFVK that the Swift SDK asserts for its seed", () => {
    const seed = Uint8Array.from(atob(SWIFT_SEED), (character) => character.charCodeAt(0));
    withResult(seed, { account: 0, start: 0, count: 1 }, (result) => {
      const ours = decodeUnified("full-viewing-key", summaryValue(result, "unifiedFullViewingKey"));
      const theirs = decodeUnified("full-viewing-key", SWIFT_UFVK);
      try {
        expect(ours.sapling).toEqual(theirs.sapling);
        expect(ours.p2pkh).toEqual(theirs.p2pkh);
        // The SDK's UFVK also holds an Orchard item, which is not derived here.
        expect(theirs.unrecognised.map(({ typecode }) => typecode)).toEqual([3]);
        // Declared in the same file, not asserted there.
        expect(summaryValue(result, "saplingFullViewingKey")).toBe(SWIFT_ZXVIEWS);
        expect(fieldsOf(result.rows[0]).address).toBe(SWIFT_ZS);
      } finally {
        ours.wipe();
        theirs.wipe();
      }
    });
  });

  it("give the receivers of the unified address that the Android SDK asserts, at j = 1", () => {
    const seed = mnemonicToSeed(ANDROID_PHRASE, "");
    try {
      withResult(seed, { account: 0, start: 0, count: 2 }, (result) => {
        expect(fieldsOf(result.rows[0]).address).toBeUndefined();
        const row = fieldsOf(result.rows[1]);
        const ours = decodeUnified("address", row.unifiedTransparentAddress ?? "");
        const theirs = decodeUnified("address", ANDROID_UA);
        expect(ours.sapling).toEqual(theirs.sapling);
        expect(ours.p2pkh).toEqual(theirs.p2pkh);
        expect(row.transparentReceiver).toBe(
          zcashTransparentAddress(theirs.p2pkh ?? new Uint8Array(0)),
        );
        // Declared in the same file, not asserted there.
        expect(row.address).toBe(ANDROID_ZS);
      });
    } finally {
      seed.fill(0);
    }
  });
});

describe("the startup self-test's refused unified address", () => {
  it("is the oracle's unordered fixture", () => {
    expect(ZCASH_UNORDERED_ADDRESS).toBe(own("unordered"));
  });
});

describe("the Sapling tab", () => {
  const adapter = ZCASH_COIN_ADAPTERS.find(({ id }) => id === "zcash-sapling");

  it("comes after the transparent tab, which stays the coin's default", () => {
    expect(ZCASH_COIN_ADAPTERS.map(({ id, defaultVariant }) => [id, defaultVariant])).toEqual([
      ["zcash", true],
      ["zcash-sapling", false],
    ]);
    expect(adapter?.label).toBe("Zcash Shielded Sapling · ZIP-32");
  });

  it("previews ZIP-32's account path with the diversifier indexes, and refuses a range past 2^31 - 1", () => {
    const input = { network: "mainnet", account: 2, branch: 0, start: 5, count: 20 } as const;
    expect(adapter?.pathPreview(input)).toBe("m/32'/133'/2' · diversifier index 5…24");
    expect(() => adapter?.pathPreview({ ...input, start: 2 ** 31 - 1, count: 2 })).toThrow();
  });

  it("shows only public fields in a row and keeps every key of the summary secret", () => {
    withResult(hexToBytes(ABANDON_ABOUT), { account: 0, start: 0, count: 3 }, (result) => {
      for (const row of result.rows)
        expect([...row.basic, ...row.advanced].filter(({ secret }) => secret)).toEqual([]);
      const secrets = [...result.basicSummary, ...result.summary]
        .filter(({ secret }) => secret)
        .map(({ key }) => key);
      expect(secrets).toEqual([
        "unifiedFullViewingKey",
        "saplingFullViewingKey",
        "unifiedIncomingViewingKey",
        "saplingSpendingKey",
      ]);
    });
  });

  it("refuses more rows than one batch holds, and a range past 2^31 - 1", () => {
    const seed = hexToBytes(ABANDON_ABOUT);
    expect(() => sapling(seed, 0, 0, 51)).toThrow();
    expect(() => sapling(seed, 0, 2 ** 31 - 1, 2)).toThrow();
    expect(() => sapling(seed, 2 ** 31, 0, 1)).toThrow();
  });
});
