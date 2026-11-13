// CIP-3's Icarus master key against published vectors, and its Icarus-Trezor variant against Node's
// own PBKDF2 and SHA-256. Public test data only. The keys below the root, and the cardano-addresses
// goldens of five more phrases, are in coin-protocols/tests/bip32-ed25519.test.ts.
import { createHash, pbkdf2Sync } from "node:crypto";
import { bech32 } from "@scure/base";
import { describe, expect, it } from "vitest";
import { cardanoIcarusRoot, type CardanoIcarusMaster } from "../src/cardano-icarus.js";
import { englishMnemonicToEntropy } from "../src/bip39.js";
import { bytesToHex } from "../src/crypto.js";

/** The root of `phrase` under `master` in hex, its bytes wiped once read. */
function rootHex(phrase: string, passphrase = "", master: CardanoIcarusMaster = "icarus"): string {
  const root = cardanoIcarusRoot(phrase, passphrase, master);
  try {
    return bytesToHex(root);
  } finally {
    root.fill(0);
  }
}

/** The bytes of a CIP-5 bech32 key, such as root_xsk1…, longer than BIP-173's 90 characters. */
function bech32Hex(text: string, prefix: string): string {
  const decoded = bech32.decodeToBytes(text, false);
  expect(decoded.prefix).toBe(prefix);
  return bytesToHex(decoded.bytes);
}

describe("CIP-3's Icarus root", () => {
  // https://github.com/cardano-foundation/CIPs/blob/7720fed633e63df51d8102f251f6ed01e9104261/CIP-0003/Icarus.md,
  // "Test vectors": the same phrase without and with the passphrase "foo" (UTF-8).
  const EIGHT =
    "eight country switch draw meat scout mystery blade tip drift useless good keep usage title";

  it("gives CIP-3's own vectors, without and with a passphrase", () => {
    expect(rootHex(EIGHT)).toBe(
      "c065afd2832cd8b087c4d9ab7011f481ee1e0721e78ea5dd609f3ab3f156d245d176bd8fd4ec60b4731c3918a2a72a0226c0cd119ec35b47e4d55884667f552a23f7fdcd4a10c6cd2c7393ac61d877873e248f417634aa3d812af327ffe9d620",
    );
    expect(rootHex(EIGHT, "foo")).toBe(
      "70531039904019351e1afb361cd1b312a4d0565d4ff9f8062d38acf4b15cce41d7b5738d9c893feea55512a3004acb0d222c35d3e3d5cde943a15a9824cbac59443cf67e589614076ba01e354b1a432e0e6db3b59e37fc56b5fb0222970a010e",
    );
  });

  it("gives cardano-serialization-lib's root and its chain code", () => {
    // Emurgo/cardano-serialization-lib @6b42538 rust/src/tests/crypto.rs, xprv_128_test and
    // chaincode_gen: the root of this phrase's entropy, without a passphrase.
    const ART =
      "art forum devote street sure rather head chuckle guard poverty release quote oak craft enemy";
    const root = rootHex(ART);
    expect(root).toBe(
      "b8f2bece9bdfe2b0282f5bad705562ac996efb6af96b648f4445ec44f47ad95c10e3d72f26ed075422a36ed8585c745a0e1150bcceba2357d058636991f38a3791e248de509c070d812ab2fda57860ac876bc489192c1ef4ce253c197ee219a4",
    );
    expect(root.slice(128)).toBe(
      "91e248de509c070d812ab2fda57860ac876bc489192c1ef4ce253c197ee219a4",
    );
  });

  it("gives cardano-addresses' Icarus and Shelley root, which are the same key", () => {
    // IntersectMBO/cardano-addresses @27a2776 test/Command/Key/FromRecoveryPhraseSpec.hs: the
    // Icarus and the Shelley style print the same root_xsk for this phrase.
    expect(
      rootHex(
        "message mask aunt wheel ten maze between tomato slow analyst ladder such report capital produce",
      ),
    ).toBe(
      bech32Hex(
        "root_xsk1qz497hekfxq0ftrzjh7sl0m9vseep44mrnmk2dkzawczwy7ghfgd3ypmaem5k7lcv782p4haa4kcwmdnks4776rkgrx9zn4h8am82dagca203x7fejp4x04ty47he9rztj2lp46fwyzz3ad2yszwadjfnv76n80u",
        "root_xsk",
      ),
    );
  });

  it("gives Trust Wallet's master kL and kR", () => {
    // trustwallet/wallet-core @7a21615 tests/chains/Cardano/AddressTests.cpp, MnemonicToAddressV3
    // ("Test from cardano-crypto.js"): getMasterKey and getMasterKeyExtension.
    const root = rootHex(
      "cost dash dress stove morning robust group affair stomach vacant route volume yellow salute laugh",
    );
    expect(root.slice(0, 64)).toBe(
      "a018cd746e128a0be0782b228c275473205445c33b9000a33dd5668b430b5744",
    );
    expect(root.slice(64, 128)).toBe(
      "26877cfe435fddda02409b839b7386f3738f10a30b95a225f4b720ee71d2505b",
    );
  });

  it("reads the passphrase as UTF-8 of its NFKD form, as BIP39's seed does", () => {
    const composed = rootHex(EIGHT, "café");
    expect(rootHex(EIGHT, "café")).toBe(composed);
    expect(composed).not.toBe(rootHex(EIGHT, "cafe"));
  });

  it("refuses a phrase that is not a valid BIP39 phrase", () => {
    expect(() => cardanoIcarusRoot(`${"abandon ".repeat(11)}abandon`, "", "icarus")).toThrow(
      /checksum/u,
    );
  });
});

describe("Trezor's Icarus-Trezor root", () => {
  /** The phrases of cardano-addresses' goldens (test/golden/addresses_*), one per word count. */
  const PHRASES = [
    "test walk nut penalty hip pave soap entry language right filter choice",
    "art forum devote street sure rather head chuckle guard poverty release quote oak craft enemy",
    "churn shaft spoon second erode useless thrive burst group seed element sign scrub buffalo jelly grace neck useless",
    "draft ability female child jump maid roof hurt below live topple paper exclude ordinary coach churn sunset emerge blame ketchup much",
    "excess behave track soul table wear ocean cash stay nature item turtle palm soccer lunch horror start stumble month panic right must lock dress",
  ];

  /**
   * CIP-3's Icarus-Trezor root by Node's PBKDF2 and SHA-256, independent of the module: a 24-word
   * phrase's entropy followed by its checksum byte (Icarus.md, "the entropy bytes are passed …
   * together with the checksum"), with the bits CIP-3 sets.
   */
  function nodeTrezorRoot(phrase: string): string {
    const entropy = Buffer.from(englishMnemonicToEntropy(phrase));
    const salt = Buffer.concat([
      entropy,
      createHash("sha256").update(entropy).digest().subarray(0, 1),
    ]);
    const root = pbkdf2Sync(Buffer.alloc(0), salt, 4096, 96, "sha512");
    root.writeUInt8(root.readUInt8(0) & 0b1111_1000, 0);
    root.writeUInt8((root.readUInt8(31) & 0b0001_1111) | 0b0100_0000, 31);
    return root.toString("hex");
  }

  // Trezor's own 24-word vector is an account key (trezor-firmware @433075c common/tests/fixtures/
  // cardano/get_public_key.derivations.json), which bip32-ed25519.test.ts checks.
  it("equals Icarus below 24 words and adds the checksum byte at 24", () => {
    for (const phrase of PHRASES.slice(0, -1))
      expect(rootHex(phrase, "", "icarus-trezor")).toBe(rootHex(phrase));
    const twentyFour = PHRASES.at(-1) ?? "";
    expect(rootHex(twentyFour, "", "icarus-trezor")).not.toBe(rootHex(twentyFour));
    expect(rootHex(twentyFour, "", "icarus-trezor")).toBe(nodeTrezorRoot(twentyFour));
  });
});
