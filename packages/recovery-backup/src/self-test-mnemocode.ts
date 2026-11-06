// MnemoCode's startup known answers in the Deriver: its WebAssembly is compiled and loaded, each of
// its parts that the page uses runs its startup cases (selfCheck* of the binding), a public
// phrase goes through the page's own adapter once, encoded in every form and decoded again, and the
// legend of MnemoCode's SeedStitch specification is read back into the record of its phrase.
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { loadMnemoCode } from "./mnemocode-module.js";
import {
  ENCODED_FORMATS,
  decodeMnemoCode,
  encodeMnemoCode,
  MNEMOCODE_VERSION,
} from "./mnemocode.js";
import { readStitchLegendLine } from "./mnemocode-stitch.js";
import { expectText, now } from "./self-test-helpers.js";

const PUBLIC_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const PUBLIC_DATES = "23-09-2026";
/** The legend of MnemoCode's docs/SEEDSTITCH.md, which holds its public phrase as word numbers. */
const SPECIFICATION_LEGEND =
  "28:1725 25:2163 57:3275 34:3917 9:480 54:1505 17:5063 63:372 46:328 7:2818 62:1114 53:1997 " +
  "37:2496 40:1945 3:882 58:7130 41:180 59:336 22:1634 36:778 64:1147 10:3804 24:1214 69:479 " +
  "56:931 30:2066 23:3224 29:797";
const SPECIFICATION_PHRASE =
  "void come effort suffer camp survey warrior heavy shoot primary clutch crush open amazing " +
  "screen patrol group space point ten exist slush involve unfold";

export async function runMnemoCodeSelfTest(): Promise<CryptoSelfTestReport> {
  const started = now();
  const binding = await loadMnemoCode();
  for (const check of [
    binding.selfCheckPhrase,
    binding.selfCheckWallet,
    binding.selfCheckQr,
    binding.selfCheckCandidates,
    binding.selfCheckSskr,
    binding.selfCheckRecovery,
    binding.selfCheckEmbroidery,
  ])
    check(false);
  expectText(
    "MnemoCode Seedshift vector",
    encodeMnemoCode(PUBLIC_MNEMONIC, "seedshift", "english", PUBLIC_DATES).payload,
    "wool abuse actual wool abuse actual wool abuse actual wool abuse congress",
  );
  for (const format of ENCODED_FORMATS) {
    const encoded = encodeMnemoCode(PUBLIC_MNEMONIC, "seedshift", format, PUBLIC_DATES);
    const decoded = decodeMnemoCode(encoded.record, {
      mode: "direct",
      format: "auto",
      dates: PUBLIC_DATES,
    });
    expectText(`MnemoCode ${format} round trip`, decoded.mnemonic ?? "", PUBLIC_MNEMONIC);
  }
  // The word numbers are counted from 1, as MnemoCode writes them.
  expectText(
    "MnemoCode SeedStitch legend",
    readStitchLegendLine(SPECIFICATION_LEGEND)?.record ?? "",
    `MNC1:seedshift:indexes:${SPECIFICATION_PHRASE.split(" ")
      .map((word) => wordlist.indexOf(word) + 1)
      .join(" ")}`,
  );
  return {
    passed: true,
    checks: [
      `MnemoCode v${MNEMOCODE_VERSION} WebAssembly: phrase, wallet, QR, candidate, share, recovery and cross-stitch known answers`,
      "MnemoCode encode and decode round trips in every form",
      "MnemoCode SeedStitch: the specification's legend read back",
    ],
    durationMs: Math.round(now() - started),
  };
}
