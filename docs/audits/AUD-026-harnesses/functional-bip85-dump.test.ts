// AUD-026 functional: BIP85 outputs of the production module (packages/crypto-core/src/bip85.ts)
// from the BIP's published master xprv and from the abandon/about seed, at every application and
// at index boundaries, dumped for functional-bip85-oracle.py. Output:
// docs/audits/AUD-026-evidence/functional/bip85.json (local evidence only).
import { mkdirSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { bytesToHex } from "@ckd/core/crypto.js";
import {
  deriveBip85Bip39,
  deriveBip85Hex,
  deriveBip85Wif,
  deriveBip85Xprv,
} from "@ckd/core/bip85.js";

const OUT = new URL("../AUD-026-evidence/functional/", import.meta.url);
/** BIP85 test vectors' master key (public test data from the BIP). */
const MASTER =
  "xprv9s21ZrQH143K2LBWUUQRFXhucrQqBpKdRRxNVq2zBqsx8HVqFk2uYo8kmbaLLHRdqtQpUm98uKfu3vca1LqdGhUtyoFnCNkfmXRyPXLjbKb";

const attempt = (run: () => unknown): unknown => {
  try {
    return run();
  } catch (cause) {
    return { refused: cause instanceof Error ? cause.message : String(cause) };
  }
};

it("dumps BIP85 outputs", () => {
  const seed = mnemonicToSeed(`${"abandon ".repeat(11)}about`);
  const roots = { master: MASTER as string | Uint8Array, abandonSeed: seed as string | Uint8Array };
  const out: Record<string, unknown> = { seedHex: bytesToHex(seed) };
  for (const [name, root] of Object.entries(roots)) {
    const before = typeof root === "string" ? root : bytesToHex(root);
    out[name] = {
      bip39: [12, 15, 18, 21, 24].flatMap((words) =>
        [0, 1, 2147483647].map((index) => deriveBip85Bip39(root, words as 12, index)),
      ),
      wif: [0, 2147483647].map((index) => deriveBip85Wif(root, index)),
      wifTestnet: deriveBip85Wif(root, 0, 0xef),
      xprv: [0, 1].map((index) => deriveBip85Xprv(root, index)),
      hex: [16, 32, 64].map((bytes) => deriveBip85Hex(root, bytes, 0)),
      refusals: {
        index2p31: attempt(() => deriveBip85Bip39(root, 12, 2147483648)),
        indexNegative: attempt(() => deriveBip85Wif(root, -1)),
        words13: attempt(() => deriveBip85Bip39(root, 13 as 12, 0)),
        hex15: attempt(() => deriveBip85Hex(root, 15, 0)),
        hex65: attempt(() => deriveBip85Hex(root, 65, 0)),
        wif256: attempt(() => deriveBip85Wif(root, 0, 256)),
      },
      unchanged: before === (typeof root === "string" ? root : bytesToHex(root)),
    };
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(new URL("bip85.json", OUT), JSON.stringify(out, null, 1));
});
