import { describe, expect, it } from "vitest";
import { base58, createBase58check } from "@scure/base";
import { sha256 } from "@ckd/core/crypto.js";
import {
  assertPublicBatchLookupInput,
  assertPublicLookupInput,
  PrivateMaterialError,
} from "../src/public-input-guard.js";

describe("public-input private-material boundary", () => {
  it.each([
    "0x" + "11".repeat(32),
    "xprv9s21ZrQH143K3QTDL4J7vG4hXr7hQeK1M8k1xH8pK5Q6Y6sXQ5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q",
    "-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----",
    "private key: secret",
  ])("rejects secret-looking public input and exposes the cleanup error", (value) => {
    expect(() => assertPublicLookupInput(value)).toThrow(PrivateMaterialError);
    expect(() => assertPublicLookupInput(value)).toThrow(/erased|No network request/iu);
  });

  // The Deriver's private key forms of the public "abandon … about" phrase's first keys: Solana's
  // keypair (Phantom's import form) and NEAR's secret key; their public counterparts pass.
  it("rejects an Ed25519 keypair in base58, bare or as a NEAR secret key, but not its public key", () => {
    for (const secret of [
      "27npWoNE4HfmLeQo1TyWcW7NEA28qnsnDK7kcttDQEWrCWnro83HMJ97rMmpvYYZRwDAvG4KRuB7hTBacvwD7bgi",
      "ed25519:F1kPR175szkGxEL52A9H6Z5ocS2BtaipprK2Hiob9DjGzHTkScrBb1yt44baXPZ3LxyHcsTPdBjHmn6zx147txH",
      "F1kPR175szkGxEL52A9H6Z5ocS2BtaipprK2Hiob9DjGzHTkScrBb1yt44baXPZ3LxyHcsTPdBjHmn6zx147txH",
    ])
      expect(() => assertPublicLookupInput(secret)).toThrow(PrivateMaterialError);
    for (const publicValue of [
      "HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk",
      "ed25519:6j4b6zUaty6fD1awqcGCCU9JYGCWYUgdJhQrzfZhqE25",
    ])
      expect(() => assertPublicLookupInput(publicValue)).not.toThrow();
  });

  // The other private keys the Deriver's rows show for the public "abandon … about" phrase's first
  // keys: Stellar's secret seed and the 32-byte hex keys of XRP and Tron (their extended private
  // keys are xprv, refused above). Computed independently with Node's crypto, which also gave the
  // phrase's recorded Stellar account ID and XRP address from the same keys.
  it.each([
    ["Stellar's secret seed", "SBUV3MRWKNS6AYKZ6E6MOUVF2OYMON3MIUASWL3JLY5E3ISDJFELYBRZ"],
    [
      "Stellar's secret seed with a typo",
      "SBUV3MRWKNS6AYKZ6E6MOUVF2OYMON3MIUASWL3JLY5E3ISDJFELYBRA",
    ],
    ["XRP's private key", "90802a50aa84efb6cdb225f17c27616ea94048c179142fecf03f4712a07ea7a4"],
    ["Tron's private key", "b5a4cea271ff424d7c31dc12a3e43e401df7a40d7412a15750f3f0b6b5449a28"],
  ])("rejects %s as the Deriver shows it", (_, secret) => {
    expect(() => assertPublicLookupInput(secret)).toThrow(PrivateMaterialError);
  });

  it("accepts a Stellar account ID, the StrKey of a public key", () => {
    expect(() =>
      assertPublicLookupInput("GB3JDWCQJCWMJ3IILWIGDTQJJC5567PGVEVXSCVPEQOTDN64VJBDQBYX"),
    ).not.toThrow();
  });

  it("rejects the Ed25519 keypair as a JSON array of bytes and the NEAR secret key with a space", () => {
    const keypair = base58.decode(
      "27npWoNE4HfmLeQo1TyWcW7NEA28qnsnDK7kcttDQEWrCWnro83HMJ97rMmpvYYZRwDAvG4KRuB7hTBacvwD7bgi",
    );
    for (const secret of [
      JSON.stringify([...keypair]),
      `[ ${[...keypair].join(", ")} ]`,
      "ed25519: F1kPR175szkGxEL52A9H6Z5ocS2BtaipprK2Hiob9DjGzHTkScrBb1yt44baXPZ3LxyHcsTPdBjHmn6zx147txH",
    ])
      expect(() => assertPublicLookupInput(secret)).toThrow(PrivateMaterialError);
    for (const notKeypair of [
      JSON.stringify([...keypair].slice(1)),
      JSON.stringify([256, ...keypair.slice(1)]),
    ])
      expect(() => assertPublicLookupInput(notKeypair)).not.toThrow();
  });

  // Family seeds of 16 zero bytes, the BIP39 entropy of the public "abandon … about" phrase, in both
  // versions (secp256k1 "s…", Ed25519 "sEd…"); computed independently with Node's crypto.
  it.each([
    ["a secp256k1", "sp6JS7f14BuwFY8Mw6bTtLKWauoUs"],
    ["an Ed25519", "sEdSJHS4oiAdz7w2X2ni1gFiqtbJHqE"],
  ])("rejects %s XRP Ledger family seed, but not with a broken checksum", (_, seed) => {
    expect(() => assertPublicLookupInput(seed)).toThrow(PrivateMaterialError);
    expect(() => assertPublicLookupInput(`${seed.slice(0, -1)}a`)).not.toThrow();
  });

  // Hedera's private keys of the public "abandon … about" phrase as DER in hex: the Ed25519 key's
  // PKCS#8 as the Deriver shows it (m/44'/3030'/0'/0'/0'), and the ECDSA key (m/44'/3030'/0'/0/0)
  // in the Hiero SDK's PKCS#8 form and in SEC1's ECPrivateKey with a public key.
  const HEDERA_ED25519_PRIVATE =
    "302e020100300506032b657004220420523f9ff611ac02e8e188617750e7e50feabd2ef9ee9b218a5c8ce2693275361d";
  const HEDERA_ECDSA_KEY = "2d08cac6b0640a3afe45acd9e3ec1c879626944f8812e05ce86ff4295ff3c097";
  const SOME_POINT =
    "0437b0bb7a8288d38ed49a524b5dc98cff3eb5ca824c9f9dc0dfdb3d9cd600f299a6179912b7451c09896c4098eca7ce6b2e58330672795e847c4d6af44e024230";

  it.each([
    ["an Ed25519 PKCS#8 key", HEDERA_ED25519_PRIVATE],
    ["the same key with 0x in upper case", `0x${HEDERA_ED25519_PRIVATE.toUpperCase()}`],
    [
      "an ECDSA key in the Hiero SDK's PKCS#8 form",
      `3030020100300706052b8104000a04220420${HEDERA_ECDSA_KEY}`,
    ],
    [
      "an ECDSA key in SEC1 with its public key",
      `30740201010420${HEDERA_ECDSA_KEY}a00706052b8104000aa144034200${SOME_POINT}`,
    ],
    [
      "an ECDSA key in SEC1 without its public key",
      `302e0201010420${HEDERA_ECDSA_KEY}a00706052b8104000a`,
    ],
  ])("rejects %s, a private key in DER", (_, secret) => {
    expect(() => assertPublicLookupInput(secret)).toThrow(PrivateMaterialError);
  });

  it("accepts public keys in DER and short values that open like a private key's DER", () => {
    for (const publicValue of [
      "302a300506032b657003210010fcec8c5db29aeab62272a08be39b1ec75eba50624351fba9948ff5d3d78ecf",
      "302d300706052b8104000a032200021de0d6f31872bbda0cfd1680e41a5a88af2646b8d1d015c5e1541ab21a0f4499",
      "0.0.302a300506032b657003210010fcec8c5db29aeab62272a08be39b1ec75eba50624351fba9948ff5d3d78ecf",
      // An EVM address may open with the same bytes; its 20 bytes hold no 32-byte key.
      "0x3012020100aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    ])
      expect(() => assertPublicLookupInput(publicValue)).not.toThrow();
  });

  // TON's secret key of the phrase's first Trust Wallet key (m/44'/607'/0'), as the Deriver shows it:
  // the 32-byte seed, then its public key.
  const TON_SECRET =
    "b477ef5ed17fb8a2b8faddd7a9835a227243a82c70b190c7af4896155aa7df9f7952e94118f34607c75e23258dd9220d66ccac5a3ee074125c25068e8107bfbf";

  it("rejects an Ed25519 keypair in hex, in any case and with 0x", () => {
    for (const secret of [TON_SECRET, TON_SECRET.toUpperCase(), `0x${TON_SECRET}`])
      expect(() => assertPublicLookupInput(secret)).toThrow(PrivateMaterialError);
  });

  it("accepts 64 bytes in hex that are not a keypair, as Dash's Orchard viewing keys are not", () => {
    for (const publicValue of [
      SOME_POINT.slice(2),
      `${TON_SECRET.slice(0, -2)}00`,
      `${TON_SECRET.slice(64)}${TON_SECRET.slice(0, 64)}`,
    ]) {
      expect(() => assertPublicLookupInput(publicValue)).not.toThrow();
      expect(() => assertPublicBatchLookupInput(`${publicValue}\n${publicValue}`)).not.toThrow();
    }
  });

  // The BIP32 master key of the public "abandon … about" phrase (BIP84's and BIP49's published root,
  // as xprv) in every private prefix of BIP32 and SLIP-132.
  const ABOUT_XPRV =
    "xprv9s21ZrQH143K3GJpoapnV8SFfukcVBSfeCficPSGfubmSFDxo1kuHnLisriDvSnRRuL2Qrg5ggqHKNVpxR86QEC8w35uxmGoggxtQTPvfUu";
  const PRIVATE_VERSIONS = {
    xprv: 0x0488ade4,
    yprv: 0x049d7878,
    zprv: 0x04b2430c,
    Yprv: 0x0295b005,
    Zprv: 0x02aa7a99,
    tprv: 0x04358394,
    uprv: 0x044a4e28,
    vprv: 0x045f18bc,
    Uprv: 0x024285b5,
    Vprv: 0x02575048,
  };
  const base58check = createBase58check(sha256);

  it.each(Object.entries(PRIVATE_VERSIONS))(
    "rejects the phrase's master key as %s, alone and inside text",
    (prefix, version) => {
      const payload = base58check.decode(ABOUT_XPRV);
      new DataView(payload.buffer, payload.byteOffset).setUint32(0, version);
      const key = base58check.encode(payload);
      expect(key.slice(0, 4)).toBe(prefix);
      for (const value of [key, `wpkh(${key}/0/*)`, `my key ${key} here`, `{"key":"${key}"}`])
        expect(() => assertPublicLookupInput(value)).toThrow(PrivateMaterialError);
    },
  );

  // Addresses that start with a private prefix's letters: in another case, found among random Tron
  // and Dash addresses, or with the exact prefix but no longer than a base58 address (a Solana key
  // of 32 bytes); the first 44 characters of a key hold no byte of its private key.
  it("accepts addresses and short values that start with a private prefix's letters", () => {
    const solanaShaped = `xprv${"2".repeat(39)}`;
    expect(base58.decode(solanaShaped)).toHaveLength(32);
    for (const value of [
      "TPRVtcLaaiBQHd6Fsc34PDoCWnqDGBimp6",
      "XprVT2gUJdj9uXoFGRktsv6eGqsd15pT4a",
      solanaShaped,
      "xprv9s21ZrQH143K3example",
    ])
      expect(() => assertPublicLookupInput(value)).not.toThrow();
  });

  it("rejects a valid mnemonic embedded in a multiline batch", () => {
    const mnemonic =
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    expect(() =>
      assertPublicBatchLookupInput(`public-value\n${mnemonic}\nother-public-value`),
    ).toThrow(PrivateMaterialError);
  });

  // Public BIP39 vector for entropy ff..ff; its short words fit a DPNS name when joined.
  const ZOO = `${"zoo ".repeat(11)}wrong`;
  const ABANDON = `${"abandon ".repeat(11)}about`;

  it.each([
    ["hyphens", ZOO.replaceAll(" ", "-")],
    ["no separator", ZOO.replaceAll(" ", "")],
    ["dots", ZOO.replaceAll(" ", ".")],
    ["underscores", ZOO.replaceAll(" ", "_")],
    ["commas", ABANDON.replaceAll(" ", ",")],
    ["commas and spaces", ABANDON.replaceAll(" ", ", ")],
    ["slashes, upper case", ABANDON.replaceAll(" ", "/").toUpperCase()],
  ])("rejects a phrase joined with %s (AUD-019-SEC001)", (_, value) => {
    expect(() => assertPublicLookupInput(value)).toThrow(PrivateMaterialError);
  });

  it("rejects a batch with twelve phrase words in a row, even with a wrong checksum", () => {
    // Twelve times "zoo" fails the BIP39 checksum, like a phrase with a typo.
    const oneWordPerLine = `${"zoo\n".repeat(11)}zoo`;
    expect(() => assertPublicLookupInput("zoo")).not.toThrow();
    expect(() => assertPublicBatchLookupInput(oneWordPerLine)).toThrow(PrivateMaterialError);
    expect(() =>
      assertPublicBatchLookupInput(`public-value\n${ZOO.replaceAll(" ", ",\n")}`),
    ).toThrow(PrivateMaterialError);
  });

  it("accepts names that only resemble a joined phrase", () => {
    for (const value of [
      "alice-bob",
      "zoo-zoo-zoo",
      "thisisaverylongdpnsnamethatisnotaphrase",
      `${"zoo-".repeat(10)}zoo`,
    ])
      expect(() => assertPublicLookupInput(value)).not.toThrow();
    expect(() => assertPublicBatchLookupInput(`${"zoo\n".repeat(10)}zoo`)).not.toThrow();
  });

  it("accepts public values and rejects empty input explicitly", () => {
    expect(() =>
      assertPublicBatchLookupInput("1BoatSLRHtKNngkdXEeobR76b53LETtpyT\nDashIdentityName"),
    ).not.toThrow();
    expect(() => assertPublicLookupInput("   ")).toThrow(/Enter a public/iu);
  });
});
