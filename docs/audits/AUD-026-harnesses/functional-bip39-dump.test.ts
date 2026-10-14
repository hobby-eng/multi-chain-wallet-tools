// AUD-026 functional: BIP39 and SeedQR outputs of the production modules for public entropy at
// every length (all-zero, all-ones, counting, alternating), plus refusals, dumped for
// functional-bip39-oracle.py, which recomputes them with its own BIP39 code. Output:
// docs/audits/AUD-026-evidence/functional/bip39.json (local evidence only).
import { mkdirSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import {
  assertValidMnemonic,
  englishMnemonicToEntropy,
  entropyToEnglishMnemonic,
  masterFingerprintFromSeed,
  mnemonicToSeed,
} from "@ckd/core/bip39.js";
import { bytesToHex } from "@ckd/core/crypto.js";
import {
  decodeCompactSeedQr,
  decodeStandardSeedQr,
  encodeCompactSeedQr,
  encodeStandardSeedQr,
} from "@ckd/recovery-backup/seedqr.js";

const OUT = new URL("../AUD-026-evidence/functional/", import.meta.url);

const attempt = (run: () => unknown): string => {
  try {
    const value = run();
    return `accepted: ${value instanceof Uint8Array ? bytesToHex(value) : String(value)}`;
  } catch (cause) {
    return `refused: ${cause instanceof Error ? cause.message : String(cause)}`;
  }
};

it("dumps BIP39 and SeedQR outputs", () => {
  const patterns: Record<string, (i: number) => number> = {
    zero: () => 0,
    ones: () => 0xff,
    counting: (i) => i,
    alternating: (i) => (i % 2 === 0 ? 0xaa : 0x55),
  };
  const valid = [];
  for (const bytes of [16, 20, 24, 28, 32])
    for (const [name, byte] of Object.entries(patterns)) {
      const entropy = Uint8Array.from({ length: bytes }, (_, i) => byte(i));
      const mnemonic = entropyToEnglishMnemonic(entropy);
      const seed = mnemonicToSeed(mnemonic, "TREZOR");
      valid.push({
        name: `${name}-${bytes}`,
        entropyHex: bytesToHex(entropy),
        mnemonic,
        roundTrip: bytesToHex(englishMnemonicToEntropy(mnemonic)),
        seedTrezor: bytesToHex(seed),
        fingerprintTrezor: masterFingerprintFromSeed(seed),
        standardSeedQr: encodeStandardSeedQr(mnemonic),
        compactSeedQr: bytesToHex(encodeCompactSeedQr(mnemonic)),
        standardDecoded: decodeStandardSeedQr(encodeStandardSeedQr(mnemonic)),
        compactDecoded: decodeCompactSeedQr(encodeCompactSeedQr(mnemonic)),
      });
    }
  const abandon = `${"abandon ".repeat(11)}about`;
  const inputs = {
    // Lenient forms the page accepts: case, extra spaces, tabs and newlines.
    upperAndSpaces: `  ${abandon.toUpperCase().replaceAll(" ", "  \t")}\n`,
    // Wrong checksum, unknown word, wrong counts.
    wrongChecksum: `${"abandon ".repeat(11)}abandon`,
    unknownWord: `${"abandon ".repeat(11)}abandonn`,
    elevenWords: `${"abandon ".repeat(10)}about`,
    thirteenWords: `${abandon} abandon`,
    empty: "",
    // A fullwidth/compatibility form that NFKD maps to ASCII: BIP39 normalizes NFKD.
    fullwidth: abandon.replace("about", "ａｂｏｕｔ"),
  };
  const refusals = Object.fromEntries(
    Object.entries(inputs).map(([name, value]) => [
      name,
      attempt(() => assertValidMnemonic(value)),
    ]),
  );
  const seedQrRefusals = {
    standard47: attempt(() => decodeStandardSeedQr("0".repeat(47))),
    standardIndex2048: attempt(() => decodeStandardSeedQr(`2048${"0000".repeat(11)}`)),
    standardBadChecksum: attempt(() => decodeStandardSeedQr("0000".repeat(12))),
    standardNonDigit: attempt(() => decodeStandardSeedQr(`000a${"0000".repeat(11)}`)),
    compact15: attempt(() => decodeCompactSeedQr(new Uint8Array(15))),
    compact33: attempt(() => decodeCompactSeedQr(new Uint8Array(33))),
    standardLeadingZeros: attempt(() => decodeStandardSeedQr(`${"0000".repeat(11)}0003`)),
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(
    new URL("bip39.json", OUT),
    JSON.stringify({ valid, refusals, seedQrRefusals }, null, 1),
  );
});
