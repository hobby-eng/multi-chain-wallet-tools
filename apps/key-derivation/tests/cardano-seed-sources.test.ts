// The page's readers of Cardano's CIP-3 roots (src/ui/cardano-seed-sources.ts), the only place that
// maps a Derivation type tab to its master key and hands it the passphrase, against published
// vectors: CIP-3's own Icarus roots (cardano-foundation/CIPs @7720fed633e63df51d8102f251f6ed01e9104261
// CIP-0003/Icarus.md, "Test vectors") and Trezor's account keys of one 24-word phrase under Icarus
// and Icarus-Trezor (trezor-firmware @433075c0a0e643d3a07364226fed40a7bbc717a8
// common/tests/fixtures/cardano/get_public_key.derivations.json). Public test data only.
import { bech32 } from "@scure/base";
import { describe, expect, it } from "vitest";
import { clearDerivationResult } from "@ckd/core/secrets.js";
import { bytesToHex } from "@ckd/core/crypto.js";
import { cardanoDerivation } from "@ckd/coins/cardano/index.js";
import type { PhraseSeedSource } from "@ckd/coins/registry-base.js";
import { phraseSeedReaders } from "../src/ui/cardano-seed-sources.js";

const EIGHT =
  "eight country switch draw meat scout mystery blade tip drift useless good keep usage title";
const VERY =
  "very improve such purity recipe deer giggle shuffle bamboo sorry galaxy damp confirm note easy pause coast purse often hint west angle spare north";

/** The seed that `source`'s reader gives `phrase` and `passphrase`, in hex; the bytes are wiped. */
function seedHex(source: PhraseSeedSource, phrase: string, passphrase = ""): string {
  const read = phraseSeedReaders[source];
  if (read === undefined) throw new Error(`No reader of ${source}.`);
  const seed = read(phrase, passphrase);
  try {
    return bytesToHex(seed);
  } finally {
    seed.fill(0);
  }
}

/** The account public key (public key ‖ chain code, hex) that variant `id` derives below `source`'s seed. */
function accountKey(source: PhraseSeedSource, id: string, phrase: string): string {
  const read = phraseSeedReaders[source];
  const derive = cardanoDerivation(id);
  if (read === undefined || derive === undefined) throw new Error(`No ${source} or ${id}.`);
  const seed = read(phrase, "");
  try {
    const result = derive({ seed, network: "mainnet", account: 0, branch: 0, start: 0, count: 1 });
    try {
      const field = result.basicSummary.find(({ key }) => key === "accountPublicKey");
      return bytesToHex(bech32.decodeToBytes(field?.value ?? "", false).bytes);
    } finally {
      clearDerivationResult(result);
    }
  } finally {
    seed.fill(0);
  }
}

describe("Cardano's seed readers on the page", () => {
  it("read the two phrase seed sources of Cardano's Icarus variants, and no other", () => {
    expect(Object.keys(phraseSeedReaders).sort()).toEqual([
      "cardano-icarus",
      "cardano-icarus-trezor",
    ]);
  });

  it("give CIP-3's Icarus roots, the passphrase as the PBKDF2 password", () => {
    expect(seedHex("cardano-icarus", EIGHT)).toBe(
      "c065afd2832cd8b087c4d9ab7011f481ee1e0721e78ea5dd609f3ab3f156d245d176bd8fd4ec60b4731c3918a2a72a0226c0cd119ec35b47e4d55884667f552a23f7fdcd4a10c6cd2c7393ac61d877873e248f417634aa3d812af327ffe9d620",
    );
    expect(seedHex("cardano-icarus", EIGHT, "foo")).toBe(
      "70531039904019351e1afb361cd1b312a4d0565d4ff9f8062d38acf4b15cce41d7b5738d9c893feea55512a3004acb0d222c35d3e3d5cde943a15a9824cbac59443cf67e589614076ba01e354b1a432e0e6db3b59e37fc56b5fb0222970a010e",
    );
    expect(seedHex("cardano-icarus-trezor", EIGHT, "foo")).toBe(
      seedHex("cardano-icarus", EIGHT, "foo"),
    );
  });

  it("give Trezor's two different roots of a 24-word phrase, each its own tab's", () => {
    expect(accountKey("cardano-icarus", "cardano", VERY)).toBe(
      "8946b80aaa2ab0839276ca373d0b7845803ae39e452ac2469986bf8b360b217f85e096c7789c5aa29012633044750b1a79ab5ac2eb7189c91113e8ffbadd550f",
    );
    expect(accountKey("cardano-icarus-trezor", "cardano-icarus-trezor", VERY)).toBe(
      "8a97a956fadbc79e09a867ed1e829af4f66a34903c9194de44c87262dfe19111dd97903ff01f4fcb6375c8252b31a59d9b170c1b61f5786304dc676270f44a90",
    );
  });

  it("normalize the passphrase as BIP39 does, so that both forms of é give one root", () => {
    for (const source of ["cardano-icarus", "cardano-icarus-trezor"] as const) {
      const composed = seedHex(source, VERY, "café");
      expect(seedHex(source, VERY, "café")).toBe(composed);
      expect(composed).not.toBe(seedHex(source, VERY, "cafe"));
    }
  });

  it("give a 96-byte CIP-3 root, never BIP39's 64-byte seed, and refuse a phrase BIP39 refuses", () => {
    for (const source of ["cardano-icarus", "cardano-icarus-trezor"] as const) {
      expect(seedHex(source, VERY)).toHaveLength(192);
      expect(() => seedHex(source, `${"abandon ".repeat(11)}abandon`)).toThrow(/checksum/u);
    }
  });
});
