// Cardano's coin module (coins/cardano/) against published vectors: its rows' addresses and keys as
// cardano-serialization-lib, CIP-11, CIP-19, Trust Wallet's wallet-core, Trezor's firmware fixtures,
// cardano-addresses and cardano-signer give them, and its variants, controls and refusals. Each
// value is copied from the file named beside it, at the commit named there. Public test data only.
import { describe, expect, it } from "vitest";
import { bech32 } from "@scure/base";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { cardanoIcarusRoot } from "@ckd/core/cardano-icarus.js";
import { clearDerivationResult } from "@ckd/core/secrets.js";
import type { DerivationResult, ResultField } from "@ckd/core/types.js";
import { CARDANO_COIN_ADAPTERS } from "@ckd/coins/adapters/cardano.js";
import {
  cardanoBaseAddress,
  cardanoEnterpriseAddress,
  cardanoRewardAddress,
} from "@ckd/coins/cardano/address.js";
import { cardanoDerivation } from "@ckd/coins/cardano/index.js";
import type { CardanoMaster } from "@ckd/coins/cardano/profiles.js";

/** The variant id of each master key. */
const ADAPTER: Readonly<Record<CardanoMaster, string>> = {
  icarus: "cardano",
  "icarus-trezor": "cardano-icarus-trezor",
  ledger: "cardano-ledger",
};

/** The seed a variant derives from: the CIP-3 root of the phrase, or Ledger's BIP39 seed. */
function seedOf(phrase: string, master: CardanoMaster, passphrase = ""): Uint8Array {
  return master === "ledger"
    ? mnemonicToSeed(phrase, passphrase)
    : cardanoIcarusRoot(phrase, passphrase, master);
}

/** The result of `master` below `phrase`; the seed is wiped and the caller clears the result. */
function resultOf(
  phrase: string,
  master: CardanoMaster,
  { account = 0, role = 0, start = 0, count = 1 } = {},
): DerivationResult {
  const derive = cardanoDerivation(ADAPTER[master]);
  if (derive === undefined) throw new Error(`${master} has no derivation.`);
  const seed = seedOf(phrase, master);
  try {
    return derive({ seed, network: "mainnet", account, branch: role, start, count });
  } finally {
    seed.fill(0);
  }
}

/** Every field of the first row and of the summary, by key; the result is cleared. */
function fieldsOf(
  phrase: string,
  master: CardanoMaster,
  options: Parameters<typeof resultOf>[2] = {},
): Record<string, string> {
  const result = resultOf(phrase, master, options);
  try {
    const row = result.rows[0];
    return Object.fromEntries(
      [
        ...result.basicSummary,
        ...result.summary,
        ...(row === undefined ? [] : [...row.basic, ...row.advanced]),
      ].map(({ key, value }: ResultField) => [key, value]),
    );
  } finally {
    clearDerivationResult(result);
  }
}

/** The bytes of a bech32 text of any length, as hex. */
const bech32Hex = (text: string): string =>
  Buffer.from(bech32.decodeToBytes(text, false).bytes).toString("hex");

const TEST_WALK = "test walk nut penalty hip pave soap entry language right filter choice";
const ART =
  "art forum devote street sure rather head chuckle guard poverty release quote oak craft enemy";
const VERY =
  "very improve such purity recipe deer giggle shuffle bamboo sorry galaxy damp confirm note easy pause coast purse often hint west angle spare north";
const ALL = Array.from({ length: 12 }, () => "all").join(" ");

describe("Cardano's addresses", () => {
  // Emurgo/cardano-serialization-lib @6b4253814f1831fee06cda2718fd47174960ace1
  // rust/src/tests/address.rs, bip32_12_base, bip32_12_enterprise, bip32_15_base,
  // bip32_15_enterprise and bip32_12_reward (network id 1): the Icarus roots of these phrases'
  // entropy (bip32_15's is the entropy of ART), m/1852'/1815'/0'/0/0 with the stake key …/2/0.
  it.each([
    {
      phrase: TEST_WALK,
      base: "addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwqfjkjv7",
      enterprise: "addr1vx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzers66hrl8",
    },
    {
      phrase: ART,
      base: "addr1q9u5vlrf4xkxv2qpwngf6cjhtw542ayty80v8dyr49rf5ewvxwdrt70qlcpeeagscasafhffqsxy36t90ldv06wqrk2qld6xc3",
      enterprise: "addr1v9u5vlrf4xkxv2qpwngf6cjhtw542ayty80v8dyr49rf5eg0kvk0f",
    },
  ])("gives cardano-serialization-lib's addresses of $phrase", ({ phrase, base, enterprise }) => {
    const fields = fieldsOf(phrase, "icarus");
    expect(fields["address"]).toBe(base);
    expect(fields["enterpriseAddress"]).toBe(enterprise);
    expect(fieldsOf(phrase, "icarus", { role: 2 })["address"]).toBe(
      phrase === TEST_WALK
        ? "stake1uyevw2xnsc0pvn9t9r9c7qryfqfeerchgrlm3ea2nefr9hqxdekzz"
        : fields["rewardAddress"],
    );
  });

  it("gives CIP-11's stake address", () => {
    // https://github.com/cardano-foundation/CIPs/blob/7720fed633e63df51d8102f251f6ed01e9104261/CIP-0011/README.md
    const phrase =
      "prevent company field green slot measure chief hero apple task eagle sunset endorse dress seed";
    expect(fieldsOf(phrase, "icarus", { role: 2 })["address"]).toBe(
      "stake1uy8ykk8dzmeqxm05znz65nhr80m0k3gxnjvdngf8azh6sjc6hyh36",
    );
  });

  // trustwallet/wallet-core @7a21615fad32edd8dc0b040d845de3973cde2c5a
  // tests/chains/Cardano/AddressTests.cpp: MnemonicToAddressV3 and the deriveAddress cases, the
  // base address of m/1852'/1815'/0'/0/0 with the stake key …/2/0 (no passphrase).
  it.each([
    [
      "cost dash dress stove morning robust group affair stomach vacant route volume yellow salute laugh",
      "addr1qxxe304qg9py8hyyqu8evfj4wln7dnms943wsugpdzzsxnkvvjljtzuwxvx0pnwelkcruy95ujkq3aw6rl0vvg32x35qc92xkq",
    ],
    [
      "youth away raise north opinion slice dash bus soldier dizzy bitter increase saddle live champion",
      "addr1q83nm9ntq3eaz8dya49txxtle6nn8geq4gmyylrzhzs7v0qjdwm6zuahwwds6c7mj8t6a09rup6m2cnh6zvzddnafp2slmcu95",
    ],
    [
      "return custom two home gain guilt kangaroo supply market current curtain tomorrow heavy blue robot",
      "addr1qywxuqm7dx0yvqnn2yllye9urz5f2e4fgwanluzh008r22e53hart525dxgjcl0xzm0kes4n5tan8f5pz7ej0tkzgyrqtfmlal",
    ],
    [
      "civil void tool perfect avocado sweet immense fluid arrow aerobic boil flash",
      "addr1q94zzrtl32tjp8j96auatnhxd2y35fnk6wuxqvqm9364vp9spdkjdsmyfhvfagjzh4uzp9zs6p5djw89jac2g0ujs2eqsuy7pu",
    ],
  ])("gives Trust Wallet's base address of %s", (phrase, address) => {
    expect(fieldsOf(phrase, "icarus")["address"]).toBe(address);
  });

  // trezor-firmware @433075c0a0e643d3a07364226fed40a7bbc717a8 common/tests/fixtures/cardano/
  // get_base_address.derivations.json (one 24-word phrase under each master key),
  // get_base_address.json and get_reward_address.json (the "all" phrase, network id 1).
  it.each([
    [
      "icarus",
      "addr1q996av5n0379tp8yllaxtgj3ffntmlrsl9sah237h65x6yt76a24dxtkgy59n8tvk00jf5dwfp8cz50g0uheuzfddcnqxp4njq",
    ],
    [
      "icarus-trezor",
      "addr1q8g9th06vccxzl96nr905al0vgg2t0fqfxrxmv7ecye3x2e66sl9kvzd905ad5natzd5wghy2w3a9lm0y7u7c5sv0c2snql3c4",
    ],
    [
      "ledger",
      "addr1q8afdsv8q9hr4z8qljl3qz3rvm048g8j506j6umrpg63nytg4txp8fd25x5lnmkdh5p9wudkh4llu4dxyc3jyjef0gwqa5dzfd",
    ],
  ] as const)("gives Trezor's base address of its 24-word phrase under %s", (master, address) => {
    expect(fieldsOf(VERY, master)["address"]).toBe(address);
  });

  it("gives Trezor's stake address and account 4 base address of its 12-word phrase", () => {
    expect(fieldsOf(ALL, "icarus", { role: 2 })["address"]).toBe(
      "stake1uyfz49rtntfa9h0s98f6s28sg69weemgjhc4e8hm66d5yacalmqha",
    );
    expect(fieldsOf(ALL, "icarus", { account: 4 })["address"]).toBe(
      "addr1q8v42wjda8r6mpfj40d36znlgfdcqp7jtj03ah8skh6u8wnrqua2vw243tmjfjt0h5wsru6appuz8c0pfd75ur7myyeqsx9990",
    );
  });

  it("gives CIP-19's address encodings of its keys", () => {
    // https://github.com/cardano-foundation/CIPs/blob/7720fed633e63df51d8102f251f6ed01e9104261/CIP-0019/README.md,
    // "Test Vectors": the mainnet addresses of types 0, 6 and 14.
    const payment = bech32.decodeToBytes(
      "addr_vk1w0l2sr2zgfm26ztc6nl9xy8ghsk5sh6ldwemlpmp9xylzy4dtf7st80zhd",
    ).bytes;
    const stake = bech32.decodeToBytes(
      "stake_vk1px4j0r2fk7ux5p23shz8f3y5y2qam7s954rgf3lg5merqcj6aetsft99wu",
    ).bytes;
    expect(cardanoBaseAddress(payment, stake)).toBe(
      "addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x",
    );
    expect(cardanoEnterpriseAddress(payment)).toBe(
      "addr1vx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzers66hrl8",
    );
    expect(cardanoRewardAddress(stake)).toBe(
      "stake1uyehkck0lajq8gr28t9uxnuvgcqrc6070x3k9r8048z8y5gh6ffgw",
    );
  });
});

describe("Cardano's keys", () => {
  it("gives cardano-addresses' root, account and address keys", () => {
    // IntersectMBO/cardano-addresses @27a2776f232f919c28b969a0c9b5f5b7e43586fd
    // test/golden/addresses_5574d91d/golden: rootXPrv, accXPrv0, addrXPrv0 and addrXPub0.
    const fields = fieldsOf(TEST_WALK, "icarus");
    expect(fields["rootPrivateKey"]).toBe(
      "root_xsk1vzrzr76vqyqlavclduhawqvtae2pq8lk0424q7t8rzfjyhhp530zxv2fwq5a3pd4vdzqtu6s2zxdjhww8xg4qwcs7y5dqne5k7mz27p6rcaath83rl20nz0v9nwdaga9fkufjuucza8vmny8qpkzwstk5qh7s88m",
    );
    expect(fields["accountPrivateKey"]).toBe(
      "acct_xsk12phl7y4uv58mne08me5szrwly2gn6jasqmkvcrndq762q68p5302z24gdf365klhll2a5f357k7nc4kpaq7j6agr5m22jq4jwlfv6l505h7dg64an4rdfk9f028nge0zcn508jw6m8lkdq36zc0v4h9xqsm27syf",
    );
    expect(fields["privateKey"]).toBe(
      "addr_xsk1hqf6v2lvhfn5mr3fe6g8ac6n8a3z6s0p24mg6kre8jadxulp530y07wjp2ml0zcz8gk0xc7zy96qp2xxtr0arjq9038k9dhkw3k3cswawhs4fkjp00kwc4wd6fynyaz5zw8ssggs9974apatyhs4ltg4puw0nn7y",
    );
    expect(fields["extendedPublicKey"]).toBe(
      "addr_xvk1w0l2sr2zgfm26ztc6nl9xy8ghsk5sh6ldwemlpmp9xylzy4dtf7a6a0p2ndyz7lva32um5jfxf69gyu0pqs3q2tat6r6kf0pt7k32rcuhjq9l",
    );
  });

  it("gives Trezor's account public keys of its 24-word phrase under each master key", () => {
    // trezor-firmware @433075c0a0e643d3a07364226fed40a7bbc717a8 common/tests/fixtures/cardano/
    // get_public_key.derivations.json: m/1852'/1815'/0', the public key and the chain code.
    const account = (master: CardanoMaster) =>
      bech32Hex(fieldsOf(VERY, master)["accountPublicKey"] ?? "");
    expect(account("icarus")).toBe(
      "8946b80aaa2ab0839276ca373d0b7845803ae39e452ac2469986bf8b360b217f85e096c7789c5aa29012633044750b1a79ab5ac2eb7189c91113e8ffbadd550f",
    );
    expect(account("icarus-trezor")).toBe(
      "8a97a956fadbc79e09a867ed1e829af4f66a34903c9194de44c87262dfe19111dd97903ff01f4fcb6375c8252b31a59d9b170c1b61f5786304dc676270f44a90",
    );
    expect(account("ledger")).toBe(
      "09a48c3390586bf1b5141e141fd2045b54f0a100af4254abb9bcf124eb82b078abb4f1731e9bb4151fb8bbe4a63c64b84a6e6193ef2b97edd4176136d55c235f",
    );
  });

  // gitmachtl/cardano-signer @3cc4a7448d57f87dc01227f56ecbe04ea4c72a94 README.md, keygen with
  // --path 1852H/1815H/0H/0/0: the address key as cardano-cli's 128 bytes.
  it.each([
    [
      "icarus",
      "60f0a79e0776b4063d7bff8ada6a37b5fb79168d5e844b51e45fa5088eac6558f858251fdfd2fc55488fceb448c5d8f5d1c93cea5505df05efed86efd90ded6d4db6843876f0154e7d5ab14ddec3dacb353b44d38b9a5a03bde142b5cedf52479eeb435bd154d50e80b2980900ac2d8237408ae373daf68d19b6013f5fcd2ef2",
    ],
    [
      "ledger",
      "f80ad0a24e08aaa39136ae52ab007b0e3b9d1d593b3d170fcaa61a322fcdb95d5e3a846ea94ebbf22ac5ab64abd7583404762bb3850f4c3362a46226ee92eec94c0ffded554c9a6eda379450af9f38640f87aff455129f679996e056697d4190a00c5bcb331ad60daf8b5b0a3fe6dfa2ec48c546f6290a9787cadd566807eb91",
    ],
  ] as const)("gives cardano-signer's %s signing key", (master, signingKey) => {
    const phrase =
      "snap siege fatal leopard label thunder rely trap robot identify someone exclude glance spring right rude tower pluck explain mouse scheme sister onion include";
    expect(fieldsOf(phrase, master)["signingKey"]).toBe(signingKey);
  });
});

/** The addresses of the rows of `master` below `phrase`, in order; the result is cleared. */
function addressesOf(
  phrase: string,
  master: CardanoMaster,
  options: Parameters<typeof resultOf>[2],
): string[] {
  const result = resultOf(phrase, master, options);
  try {
    return result.rows.map((row) => row.basic.find(({ key }) => key === "address")?.value ?? "");
  } finally {
    clearDerivationResult(result);
  }
}

const ABOUT = `${"abandon ".repeat(11)}about`;

// Own values (CORE-27): no published vector has a change address or an index past 0 on mainnet
// (Trezor's get_base_address.json has none). They come from test/oracles/cardano_oracle.py, a
// standard-library reimplementation that first reproduces the published values of this file.
describe("Cardano's change rows and later indexes", () => {
  it.each([
    [
      "icarus",
      "addr1qykhadtnvjpkxh76xgr0mu4huc9tg800x2sxsqemn9uz8jh927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq28kufu",
      "addr1q9pydq93mn8yahz7zkzh80tfla330pjruy9r7975uk5nu7l927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq8vtmft",
    ],
    [
      "ledger",
      "addr1qx666n5qs5c8gjqjfr2v4c3ny209ng5s0rsthnuels0el0sayfawlf9hwv2fzuygt2km5v92kvf8e3s3mk7ynxw77cwq6avqke",
      "addr1q8muu868678ae33qfj2ccu6fu4t0492eewtujzq09kyrwwgayfawlf9hwv2fzuygt2km5v92kvf8e3s3mk7ynxw77cwq5kt7sh",
    ],
  ] as const)("gives %s's first change address and receive address #5", (master, change, fifth) => {
    expect(addressesOf(ABOUT, master, { role: 1 })).toEqual([change]);
    // #5 as the last row of a batch from #3, so that a row derived at the batch's start fails.
    expect(addressesOf(ABOUT, master, { start: 3, count: 3 })[2]).toBe(fifth);
  });

  it("derives each row at its own index, whatever batch holds it", () => {
    for (const role of [0, 1, 2]) {
      const batch = addressesOf(ABOUT, "icarus", { role, start: 0, count: 6 });
      expect(new Set(batch).size).toBe(6);
      for (const [index, address] of batch.entries())
        expect(addressesOf(ABOUT, "icarus", { role, start: index })).toEqual([address]);
    }
  });
});

describe("Cardano's rows", () => {
  it("shows a payment key's addresses and keys, the private ones secret", () => {
    const result = resultOf(TEST_WALK, "icarus", { start: 3, count: 2 });
    try {
      expect(result.rows.map(({ index, path, title }) => [index, path, title])).toEqual([
        [3, "m/1852'/1815'/0'/0/3", "Address #3"],
        [4, "m/1852'/1815'/0'/0/4", "Address #4"],
      ]);
      expect(result.pathTemplate).toBe("m/1852'/1815'/0'/0/i");
      expect(result.networkLabel).toBe("Cardano mainnet");
      const row = result.rows[0];
      expect(row?.basic.map(({ key, secret }) => [key, secret])).toEqual([
        ["address", false],
        ["publicKey", false],
        ["privateKey", true],
      ]);
      expect(row?.basic[0]?.role).toBe("paymentAddress");
      expect(row?.advanced.map(({ key, secret, role }) => [key, secret, role])).toEqual([
        ["path", false, undefined],
        ["enterpriseAddress", false, "paymentAddress"],
        ["rewardAddress", false, undefined],
        ["publicKeyHex", false, undefined],
        ["extendedPublicKey", false, undefined],
        ["signingKey", true, undefined],
      ]);
      expect(row?.basic[1]?.value).toMatch(/^addr_vk1/u);
      expect(result.basicSummary.map(({ key }) => key)).toEqual(["accountPublicKey"]);
      expect(result.summary.map(({ key, secret }) => [key, secret])).toEqual([
        ["accountPrivateKey", true],
        ["rootPrivateKey", true],
        ["derivation", false],
      ]);
    } finally {
      clearDerivationResult(result);
    }
  });

  it("shows the stake key's reward address, which is no payment address", () => {
    const result = resultOf(TEST_WALK, "icarus", { role: 2 });
    try {
      const row = result.rows[0];
      expect(row?.title).toBe("Stake key #0");
      expect(row?.path).toBe("m/1852'/1815'/0'/2/0");
      expect(row?.basic[0]).toMatchObject({ key: "address", secret: false });
      expect(row?.basic[0]?.role).toBeUndefined();
      expect(row?.basic[1]?.value).toMatch(/^stake_vk1/u);
      expect(row?.advanced.map(({ key }) => key)).not.toContain("enterpriseAddress");
    } finally {
      clearDerivationResult(result);
    }
  });

  it("names each master key in its notices and keeps the caller's seed", () => {
    const seed = cardanoIcarusRoot(TEST_WALK, "", "icarus");
    const copy = Uint8Array.from(seed);
    const derive = cardanoDerivation("cardano");
    try {
      const result = derive?.({
        seed,
        network: "mainnet",
        account: 0,
        branch: 0,
        start: 0,
        count: 1,
      });
      expect(seed).toEqual(copy);
      expect(result?.notices.join(" ")).toMatch(/Yoroi/u);
      if (result !== undefined) clearDerivationResult(result);
    } finally {
      seed.fill(0);
      copy.fill(0);
    }
    for (const [master, word] of [
      ["ledger", /Ledger and BitBox02/u],
      ["icarus-trezor", /24 words/u],
    ] as const) {
      const result = resultOf(TEST_WALK, master);
      try {
        expect(result.notices.join(" ")).toMatch(word);
      } finally {
        clearDerivationResult(result);
      }
    }
  });
});

describe("Cardano's variants and refusals", () => {
  it("offers three variants with CIP-1852's role control, mainnet only", () => {
    expect(
      CARDANO_COIN_ADAPTERS.map(({ id, group, seedSource, defaultVariant }) => [
        id,
        group,
        seedSource,
        defaultVariant,
      ]),
    ).toEqual([
      ["cardano", "Cardano", "cardano-icarus", true],
      ["cardano-ledger", "Cardano", undefined, false],
      ["cardano-icarus-trezor", "Cardano", "cardano-icarus-trezor", false],
    ]);
    for (const adapter of CARDANO_COIN_ADAPTERS) {
      expect(adapter.networkControl).toBe(false);
      expect(adapter.branchControl?.options?.map(({ value }) => value)).toEqual([0, 1, 2]);
      const input = { network: "mainnet", account: 7, branch: 2, start: 0, count: 20 } as const;
      expect(adapter.pathPreview(input)).toBe("m/1852'/1815'/7'/2/0…19");
      expect(() => adapter.pathPreview({ ...input, branch: 3 })).toThrow(/Role/u);
      expect(() => adapter.pathPreview({ ...input, start: 2 ** 31 - 1, count: 2 })).toThrow();
    }
  });

  it("refuses a seed of the other kind, a role past the stake key and an empty batch", () => {
    const bip39Seed = mnemonicToSeed(TEST_WALK);
    const root = cardanoIcarusRoot(TEST_WALK, "", "icarus");
    const input = { network: "mainnet", account: 0, branch: 0, start: 0, count: 1 } as const;
    try {
      expect(() => cardanoDerivation("cardano")?.({ ...input, seed: bip39Seed })).toThrow(
        /96 bytes/u,
      );
      expect(() => cardanoDerivation("cardano-ledger")?.({ ...input, seed: root })).toThrow(
        /64-byte BIP39 seed/u,
      );
      expect(() => cardanoDerivation("cardano")?.({ ...input, seed: root, branch: 3 })).toThrow(
        /Role/u,
      );
      expect(() => cardanoDerivation("cardano")?.({ ...input, seed: root, count: 0 })).toThrow();
      expect(cardanoDerivation("solana")).toBeUndefined();
    } finally {
      bip39Seed.fill(0);
      root.fill(0);
    }
  });
});
