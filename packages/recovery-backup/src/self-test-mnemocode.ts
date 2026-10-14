import type { CryptoSelfTestReport } from "@ckd/self-test-types";
// The build puts the recognition of its coins here (see mnemocode-wallet.ts), so that the known
// answers of the coins it leaves out are left out too.
import { MnemoCodeWalletRecognition } from "@ckd/recovery-backup/mnemocode-wallet-bitcoin.js";
import { MnemoCodeSelfTest } from "../../recovery-mnemocode/source/core/self-test.js";
import type { SelfTestFeature } from "../../recovery-mnemocode/source/core/self-test-check.js";
import { WORD_HINTS_SELF_TEST } from "../../recovery-mnemocode/source/core/word-hints-self-test.js";
import { RE_ENCODING_SELF_TEST } from "../../recovery-mnemocode/source/core/re-encoding-self-test.js";
import {
  ENCODED_FORMATS,
  decodeMnemoCode,
  encodeMnemoCode,
  MNEMOCODE_VERSION,
  parseMnemoCodeDates,
  recoverMnemoCodeLegacyLastWords,
  recoverMnemoCodeWord,
} from "./mnemocode.js";
import { expectText, now } from "./self-test-helpers.js";

const PUBLIC_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
/**
 * The checks of what the page builds into MnemoCode beside its library, in the startup known answers
 * and in the self-test the person starts: the recognition of this build's coins and the hints below
 * the word fields.
 */
export const MNEMOCODE_PAGE_FEATURES: readonly SelfTestFeature[] = [
  ...MnemoCodeWalletRecognition.SELF_TESTS,
  WORD_HINTS_SELF_TEST,
  RE_ENCODING_SELF_TEST,
];

const PUBLIC_LEGACY =
  "mosquito dust hotel maximum rich kitten hair mother salute dream flush hospital";

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
  for (const format of ENCODED_FORMATS) {
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
  // MnemoCode's own quick known answers: its word lists and fixed vectors, every library feature
  // (dates, searches, candidate lists, backup checks, share repair), the wallet recognition of
  // this build's coins and the word hints. It throws at the first difference.
  MnemoCodeSelfTest.core(MNEMOCODE_PAGE_FEATURES);
  return {
    passed: true,
    checks: [
      `MnemoCode v${MNEMOCODE_VERSION} vectors, word recovery, and all representation round trips`,
      "MnemoCode library, wallet recognition and word hint known answers",
    ],
    durationMs: Math.round(now() - started),
  };
}
