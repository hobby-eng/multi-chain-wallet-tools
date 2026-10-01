import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import {
  decodeMnemoCode,
  encodeMnemoCode,
  parseMnemoCodeDates,
  recoverMnemoCodeLegacyLastWords,
  recoverMnemoCodeWord,
  type MnemoCodeFormat,
} from "./mnemocode.js";
import { expectText, now } from "./self-test-helpers.js";

const PUBLIC_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const PUBLIC_LEGACY =
  "mosquito dust hotel maximum rich kitten hair mother salute dream flush hospital";
const FORMATS: readonly MnemoCodeFormat[] = [
  "english",
  "indexes",
  "unicode",
  "colors",
  "colors-unicode",
];

export function runMnemoCodeSelfTest(): CryptoSelfTestReport {
  const started = now();
  const dates = parseMnemoCodeDates("23-09-2026");
  const shifted = encodeMnemoCode(PUBLIC_MNEMONIC, "seedshift", "english", dates);
  expectText(
    "MnemoCode Seedshift vector",
    shifted.payload,
    "wool abuse actual wool abuse actual wool abuse actual wool abuse congress",
  );
  expectText(
    "MnemoCode BIP39Colors vector",
    encodeMnemoCode(PUBLIC_MNEMONIC, "direct", "colors").payload,
    "#000064 #1EAB91 #3D0964 #5BB491 #7A1264 #98BD91 #B71B64 #D5C694",
  );
  for (const format of FORMATS) {
    const encoded = encodeMnemoCode(PUBLIC_MNEMONIC, "seedshift", format, dates);
    const decoded = decodeMnemoCode(encoded.record, {
      mode: "direct",
      format: "auto",
      dates,
    });
    expectText(`MnemoCode ${format} round trip`, decoded.mnemonic ?? "", PUBLIC_MNEMONIC);
  }
  const candidates = recoverMnemoCodeWord(PUBLIC_MNEMONIC.replace(/about$/u, "?"));
  if (candidates.length !== 128) {
    throw new Error("MnemoCode final-word recovery candidate count mismatch.");
  }
  const recoveredAbout = candidates.find((candidate) => candidate.word === "about");
  expectText("MnemoCode word recovery vector", recoveredAbout?.mnemonic ?? "", PUBLIC_MNEMONIC);
  expectText("MnemoCode word recovery index", String(recoveredAbout?.wordIndex), "4");
  expectText("MnemoCode word recovery checksum", recoveredAbout?.checksumBits ?? "", "0011");
  const legacyCandidates = recoverMnemoCodeLegacyLastWords(PUBLIC_LEGACY);
  if (legacyCandidates.length !== 128) {
    throw new Error("MnemoCode legacy final-word candidate count mismatch.");
  }
  if (legacyCandidates.filter((candidate) => candidate.preservesLegacyEntropy).length !== 1) {
    throw new Error("MnemoCode legacy entropy-preserving candidate count mismatch.");
  }
  return {
    passed: true,
    checks: ["MnemoCode v0.1.0 vectors, word recovery, and all representation round trips"],
    durationMs: Math.round(now() - started),
  };
}
