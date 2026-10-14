// The self-test of MnemoCode's rules: whether this copy encodes, decodes, recovers and checks as
// the published vectors say, before a person trusts it with a seed phrase. A host runs it on the
// person's request (menu entry 9, the command self-test, a page's button); the quick part of it
// (MnemoCodeSelfTest.core) also runs before every command of the command line.
//
// Each feature keeps its checks in a module beside it, named after it with -self-test, or
// sskr/known-answers.ts: quick known answers, which core() runs, and its row in the full
// self-test, which runs them again with the slower checks. This module composes those of the
// library. The checks of a feature that a host builds in or leaves out, such as wallet evidence,
// the coins or the card renderers, come from the host (SelfTestHost.features, core's features),
// so that a build without the feature carries none of them.
//
// From the host it needs, as parameters: the master fingerprint of a phrase (from the host's
// PBKDF2, core/master-fingerprint.ts), the public vectors file vectors/mnemocode-v1.json as parsed
// JSON (the host reads or bundles it), and optionally its PBKDF2 for the BIP39 seed vectors, its
// SSKR library (SharePlatform) for the share checks, the checks of the features it builds in, and
// checks of its own (the command line adds its protection, QR and file checks). A check whose host
// service is missing is left out, or runs without the part that needs it, as its row says. It reads
// no file and keeps nothing.
//
// Host-neutral: it imports only other host-neutral modules, @scure/bip39 with its word lists and
// @noble/hashes (test/portable-modules.test.ts).

import { BIP39_ENTROPY_BYTES } from "./bip39-sizes.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { entropyToMnemonic } from "@scure/bip39";
import { phraseChecksumValid } from "./english-words.js";
import { wordlist as englishWordlist } from "@scure/bip39/wordlists/english.js";
import { wordlist as traditionalChineseWordlist } from "@scure/bip39/wordlists/traditional-chinese.js";
import type { SharePlatform } from "../sskr/share-platform.js";
import { checkSskrKnownAnswers, checkSskrTransportStartup } from "../sskr/known-answers.js";
import { checkShareRepair, checkShareRepairStartup } from "../sskr/repair-self-test.js";
import { checkShareUnmasking } from "../sskr/share-unmasking-self-test.js";
import { checkBackupCheck, checkBackupCheckStartup } from "./backup-check-self-test.js";
import { checkBackupReading, checkBackupReadingStartup } from "./backup-reading-self-test.js";
import { checkCandidateEncryption } from "./candidate-encryption-self-test.js";
import { checkCandidateListStartup } from "./candidate-list-self-test.js";
import { checkWordSearch, checkWordSearchStartup } from "./candidates-self-test.js";
import { checkDateSearch, checkDateSearchStartup } from "./date-search-self-test.js";
import { parseDate } from "./dates.js";
import type { Pbkdf2HmacSha512 } from "./master-fingerprint.js";
import {
  BIP39_VECTOR_COUNT,
  checkMasterFingerprint,
  checkMasterFingerprintStartup,
} from "./master-fingerprint-self-test.js";
import { formatEncoded } from "./representations.js";
import { checkRepresentationStartup } from "./representations-self-test.js";
import {
  expectSame as equal,
  type SelfTestCheck,
  type SelfTestFeature,
} from "./self-test-check.js";
import {
  decodeInputDirect,
  decodeInputLegacy,
  encodeMnemonic,
  encodeMnemonicLegacy,
  representMnemonic,
} from "./seedshift.js";
import { ENCODED_FORMATS } from "./types.js";
import { recoverLegacyValidLastWords } from "./words.js";
import { hexOfBytes } from "./bits.js";
import { Masking, decodeInput } from "./masking.js";
import { isFingerprintText, type PhraseFingerprint } from "./wallet-check.js";
import { ErrorCatalog } from "./error-catalog.js";

const ERRORS = new ErrorCatalog("core.self-test", {
  "checksum-valid-seedshift-produced-invalid-bip39-checksum": () =>
    "Checksum-valid Seedshift produced an invalid BIP39 checksum.",
  "non-empty-string": (value0: string, value1: string) =>
    `${value0}.${value1} must be a non-empty string.`,
  "array-strings": (value0: string, value1: string) =>
    `${value0}.${value1} must be an array of strings.`,
  object: (value0: string) => `${value0} must be an object.`,
  "mode-unsupported": (value0: string) => `${value0}.mode is unsupported.`,
  "source-mnemonic-valid-english-bip39-mnemonic": (value0: string) =>
    `${value0}.sourceMnemonic must be a valid English BIP39 mnemonic.`,
  "dates-does-not-match-mode": (value0: string) => `${value0}.dates does not match its mode.`,
  "eight-lowercase-hexadecimal-characters": (value0: string, value1: string) =>
    `${value0}.${value1} must be eight lowercase hexadecimal characters.`,
  "public-vector-file-unsupported-structure": () =>
    "Public vector file has an unsupported structure.",
  "public-vector-names-unique": () => "Public vector names must be unique.",
  "public-vector-file-missing-required-vector": (value0: string) =>
    `Public vector file is missing required vector: ${value0}.`,
  "self-test-host-s-fingerprint-function": {
    kind: "type",
    text: () => "A self-test needs the host's fingerprint function.",
  },
});

export type { SelfTestCheck, SelfTestFeature };

const PUBLIC_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const CHECKSUM_VALID_DATE = [parseDate("23-09-2026")];
const CHECKSUM_VALID_ENGLISH =
  "wool abuse actual wool abuse actual wool abuse actual wool abuse congress";
const LEGACY_SOURCE =
  "oppose duck hello neglect reveal key humor mosquito road evoke flock hedgehog";
const LEGACY_DATES = ["10-07-1963", "27-04-1956", "31-01-1994"].map(parseDate);
const LEGACY_ENGLISH =
  "mosquito dust hotel maximum rich kitten hair mother salute dream flush hospital";
/** SHA-256 of each BIP39 word list joined by line feeds, as @scure/bip39 ships them. */
const CHINESE_WORDLIST_SHA256 = "407312f9014543242bd157c255125a753ac60128fc15883a33b8685a9328b0cc";
const WORDLIST_SHA256 = "187db04a869dd9bc7be80d21a86497d692c0db6abd3aa8cb6be5d618ff757fae";

/** A check that passed, with the time it took. */
export interface SelfTestRow {
  readonly name: string;
  readonly detail: string;
  readonly milliseconds: number;
}

/** What a self-test that passed reports. */
export interface SelfTestReport {
  readonly rows: readonly SelfTestRow[];
  readonly publicVectors: number;
  readonly roundTrips: number;
  readonly milliseconds: number;
}

/** What a self-test takes from its host. */
export interface SelfTestHost {
  /** The master fingerprint of a phrase with an empty BIP39 passphrase. */
  readonly fingerprint: PhraseFingerprint;
  /** vectors/mnemocode-v1.json, parsed. */
  readonly publicVectors: unknown;
  /**
   * The host's PBKDF2-HMAC-SHA512, for the seeds of the BIP39 vectors; without it the BIP39 seed
   * row checks only its quick known answers.
   */
  readonly pbkdf2?: Pbkdf2HmacSha512 | undefined;
  /**
   * The host's SSKR library; without it the SSKR row is left out, and the share repair and the
   * share check run without the parts that restore shares.
   */
  readonly sharePlatform?: SharePlatform | undefined;
  /** What the report says of the host's SSKR library, such as "pinned WASM". */
  readonly shareLibrary?: string | undefined;
  /**
   * The checks of the features that the host builds in beside the library's, such as wallet
   * evidence or the coins: run after the library's, before `after`.
   */
  readonly features?: readonly SelfTestFeature[];
  /** The host's own checks, run before the library's and after them. */
  readonly before?: readonly SelfTestCheck[];
  readonly after?: readonly SelfTestCheck[];
}

/** SHA-256 of a word list joined by line feeds, as hexadecimal. */
function wordlistDigest(words: readonly string[]): string {
  const digest = sha256(new TextEncoder().encode(words.join("\n")));
  return hexOfBytes(digest);
}

/** The word lists and the fixed forward and reverse vectors: quick enough before every command. */
function runCoreChecks(): void {
  equal(englishWordlist.length, 2048, "English BIP39 word-list length");
  equal(wordlistDigest(englishWordlist), WORDLIST_SHA256, "English BIP39 word-list SHA-256");
  equal(traditionalChineseWordlist.length, 2048, "Traditional Chinese BIP39 word-list length");
  equal(
    wordlistDigest(traditionalChineseWordlist),
    CHINESE_WORDLIST_SHA256,
    "Traditional Chinese BIP39 word-list SHA-256",
  );

  checkRepresentationStartup();
  checkSskrTransportStartup();
  // Forgotten words are the word search's, which checkWordSearchStartup checks at startup; the
  // valid last words of the public vector are known answers of the final-word path.
  const about = recoverLegacyValidLastWords(PUBLIC_MNEMONIC).find(
    (candidate) => candidate.word === "about",
  );
  equal(about?.wordIndex, 4, "Final-word BIP39 index");
  equal(about?.checksumBits, "0011", "Final-word checksum bits");
  equal(about?.mnemonic, PUBLIC_MNEMONIC, "Final-word public vector");

  const legacyLastWords = recoverLegacyValidLastWords(LEGACY_ENGLISH);
  equal(legacyLastWords.length, 128, "Legacy final-word candidate count");
  equal(
    legacyLastWords.filter((candidate) => candidate.preservesLegacyEntropy).length,
    1,
    "Legacy entropy-preserving final-word count",
  );

  const shifted = encodeMnemonic(PUBLIC_MNEMONIC, CHECKSUM_VALID_DATE);
  equal(
    shifted.shiftedEnglish.join(" "),
    CHECKSUM_VALID_ENGLISH,
    "Checksum-valid Seedshift vector",
  );
  if (!phraseChecksumValid(shifted.shiftedEnglish.join(" ")))
    throw ERRORS.create("checksum-valid-seedshift-produced-invalid-bip39-checksum", []);
  equal(
    decodeInput(CHECKSUM_VALID_ENGLISH, "english", CHECKSUM_VALID_DATE).recoveredMnemonic,
    PUBLIC_MNEMONIC,
    "Checksum-valid Seedshift reverse vector",
  );

  const legacy = encodeMnemonicLegacy(LEGACY_SOURCE, LEGACY_DATES);
  equal(legacy.shiftedEnglish.join(" "), LEGACY_ENGLISH, "Legacy Seedshift vector");
  equal(
    decodeInputLegacy(LEGACY_ENGLISH, "english", LEGACY_DATES).recoveredMnemonic,
    LEGACY_SOURCE,
    "Legacy Seedshift reverse vector",
  );
}

/**
 * The modes that the public vectors are of: seedshift-legacy-valid has none. Each is encoded below
 * by its own engine, not through Masking, so that the vectors check Masking's choice too.
 */
const VECTOR_MODES = Object.freeze(["direct", "seedshift", "seedshift-legacy"] as const);
type VectorMode = (typeof VECTOR_MODES)[number];

function isVectorMode(mode: string): mode is VectorMode {
  return (VECTOR_MODES as readonly string[]).includes(mode);
}

interface PublicVector {
  readonly name: string;
  readonly mode: VectorMode;
  readonly sourceMnemonic: string;
  readonly dates: readonly string[];
  readonly english: string;
  readonly indexes: string;
  readonly unicode: string;
  readonly colors: string;
  readonly colorsUnicode: string;
  readonly sourceFingerprint?: string | undefined;
  readonly encodedFingerprint?: string | undefined;
}

const REQUIRED_VECTOR_NAMES = new Set([
  "direct-12",
  "checksum-valid-seedshift-12",
  "checksum-valid-seedshift-15",
  "checksum-valid-seedshift-18",
  "checksum-valid-seedshift-21",
  "checksum-valid-seedshift-24",
  "legacy-seedshift-12",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0)
    throw ERRORS.create("non-empty-string", [`${label}`, `${key}`]);
  return value;
}

function requiredStrings(record: Record<string, unknown>, key: string, label: string): string[] {
  const value = record[key];
  if (!isStringList(value)) throw ERRORS.create("array-strings", [`${label}`, `${key}`]);
  return value;
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function validateVector(value: unknown, index: number): PublicVector {
  const label = `vectors[${index}]`;
  if (!isObject(value)) throw ERRORS.create("object", [`${label}`]);
  const mode = requiredString(value, "mode", label);
  if (!isVectorMode(mode)) throw ERRORS.create("mode-unsupported", [`${label}`]);
  const sourceMnemonic = requiredString(value, "sourceMnemonic", label);
  if (!phraseChecksumValid(sourceMnemonic))
    throw ERRORS.create("source-mnemonic-valid-english-bip39-mnemonic", [`${label}`]);
  const dates = requiredStrings(value, "dates", label);
  try {
    Masking.of(mode).assertDateCount(dates.length);
  } catch {
    throw ERRORS.create("dates-does-not-match-mode", [`${label}`]);
  }
  dates.forEach(parseDate);
  const fingerprint = (key: "sourceFingerprint" | "encodedFingerprint") => {
    const candidate = value[key];
    if (candidate === undefined) return undefined;
    if (typeof candidate !== "string" || !isFingerprintText(candidate))
      throw ERRORS.create("eight-lowercase-hexadecimal-characters", [`${label}`, `${key}`]);
    return candidate;
  };
  return {
    name: requiredString(value, "name", label),
    mode,
    sourceMnemonic,
    dates,
    english: requiredString(value, "english", label),
    indexes: requiredString(value, "indexes", label),
    unicode: requiredString(value, "unicode", label),
    colors: requiredString(value, "colors", label),
    colorsUnicode: requiredString(value, "colorsUnicode", label),
    sourceFingerprint: fingerprint("sourceFingerprint"),
    encodedFingerprint: fingerprint("encodedFingerprint"),
  };
}

/** The vectors of the parsed file, refused unless every required one is there, once. */
function publicVectorsOf(parsed: unknown): readonly PublicVector[] {
  if (!isObject(parsed) || parsed.version !== 1 || !Array.isArray(parsed.vectors))
    throw ERRORS.create("public-vector-file-unsupported-structure", []);
  const vectors = parsed.vectors.map(validateVector);
  const names = new Set(vectors.map((vector) => vector.name));
  if (names.size !== vectors.length) throw ERRORS.create("public-vector-names-unique", []);
  for (const name of REQUIRED_VECTOR_NAMES) {
    if (!names.has(name))
      throw ERRORS.create("public-vector-file-missing-required-vector", [`${name}`]);
  }
  return vectors;
}

function resultForVector(vector: PublicVector) {
  const parsedDates = vector.dates.map(parseDate);
  if (vector.mode === "direct") return representMnemonic(vector.sourceMnemonic);
  if (vector.mode === "seedshift") return encodeMnemonic(vector.sourceMnemonic, parsedDates);
  return encodeMnemonicLegacy(vector.sourceMnemonic, parsedDates);
}

/** Every form and fingerprint of every public vector; gives how many vectors there are. */
async function checkPublicVectors(host: SelfTestHost): Promise<number> {
  const vectors = publicVectorsOf(host.publicVectors);
  for (const vector of vectors) {
    const result = resultForVector(vector);
    equal(formatEncoded(result, "english"), vector.english, `${vector.name} English`);
    equal(formatEncoded(result, "indexes"), vector.indexes, `${vector.name} indexes`);
    equal(formatEncoded(result, "unicode"), vector.unicode, `${vector.name} Unicode`);
    equal(formatEncoded(result, "colors"), vector.colors, `${vector.name} colors`);
    equal(
      formatEncoded(result, "colors-unicode"),
      vector.colorsUnicode,
      `${vector.name} colors-unicode`,
    );
    if (vector.sourceFingerprint !== undefined)
      equal(
        await host.fingerprint(result.sourceMnemonic),
        vector.sourceFingerprint,
        `${vector.name} source fingerprint`,
      );
    if (vector.encodedFingerprint !== undefined)
      equal(
        await host.fingerprint(result.shiftedEnglish.join(" ")),
        vector.encodedFingerprint,
        `${vector.name} encoded fingerprint`,
      );
  }
  return vectors.length;
}

/** Every phrase length in every form and mode, forward and back; gives the round trips made. */
function checkAllLengthsAndFormats(): number {
  const entropySizes = BIP39_ENTROPY_BYTES;
  const dates = [parseDate("23-09-2026"), parseDate("08-08-1988"), parseDate("07-11-1951")];
  let count = 0;
  for (const entropySize of entropySizes) {
    const mnemonic = entropyToMnemonic(
      Uint8Array.from({ length: entropySize }, (_, index) => index),
      englishWordlist,
    );
    for (const format of ENCODED_FORMATS) {
      const direct = representMnemonic(mnemonic);
      equal(
        decodeInputDirect(formatEncoded(direct, format), format).recoveredMnemonic,
        mnemonic,
        `${entropySize}-byte direct ${format}`,
      );
      const shifted = encodeMnemonic(mnemonic, dates);
      equal(
        decodeInput(formatEncoded(shifted, format), format, dates).recoveredMnemonic,
        mnemonic,
        `${entropySize}-byte Seedshift ${format}`,
      );
      const legacy = encodeMnemonicLegacy(mnemonic, dates);
      equal(
        decodeInputLegacy(formatEncoded(legacy, format), format, dates).recoveredMnemonic,
        mnemonic,
        `${entropySize}-byte legacy ${format}`,
      );
      count += 3;
    }
  }
  return count;
}

function checkDateOrdering(): void {
  const first = [parseDate("23-09-2026"), parseDate("08-08-1988"), parseDate("07-11-1951")];
  const reversed = [...first].reverse();
  equal(
    formatEncoded(encodeMnemonic(PUBLIC_MNEMONIC, first), "indexes"),
    formatEncoded(encodeMnemonic(PUBLIC_MNEMONIC, reversed), "indexes"),
    "Date-order independence",
  );
}

/**
 * The quick known answers of the library's features beside the core ones, in the order core()
 * runs them: each needs nothing from the host and takes milliseconds.
 */
const FEATURE_STARTUP: readonly (() => void)[] = [
  checkMasterFingerprintStartup,
  checkDateSearchStartup,
  checkBackupReadingStartup,
  checkWordSearchStartup,
  checkCandidateListStartup,
  checkBackupCheckStartup,
  checkShareRepairStartup,
];

/** The rows of the library's features in the full self-test, with the host's services. */
function featureChecks(host: SelfTestHost): SelfTestCheck[] {
  const { fingerprint, pbkdf2, sharePlatform: platform } = host;
  // Short enough for one line of the command line's report, as the rows before them.
  const withShares = (detail: string, shares: string) =>
    platform === undefined ? detail : `${detail}; ${shares}`;
  return [
    {
      name: "BIP39 seed",
      detail:
        pbkdf2 === undefined
          ? "published seed, NFKD salt, refusals"
          : `published seed, NFKD salt, refusals; ${BIP39_VECTOR_COUNT} BIP39 vectors`,
      run: () => checkMasterFingerprint(pbkdf2),
    },
    {
      name: "Dates",
      detail: "? and | patterns, whole dates, refusals; wallet search",
      run: () => checkDateSearch(fingerprint),
    },
    {
      name: "Backup reading",
      detail: "codes marked with ?, shares told apart; encoded search",
      run: () => checkBackupReading(fingerprint),
    },
    {
      name: "Word search",
      detail: "several words, prefixes, choices, missing word; wallet",
      run: () => checkWordSearch(fingerprint),
    },
    {
      name: "Candidate lists",
      detail: "MNCL bytes, Padmé, refusals; age files and scrypt",
      run: async () => {
        checkCandidateListStartup();
        await checkCandidateEncryption();
      },
    },
    {
      name: "Backup check",
      detail: withShares("codes and dates right and wrong", "shares"),
      run: () => checkBackupCheck(platform),
    },
    {
      name: "Share repair",
      detail: withShares("whole and digit marks, refusals", "shares together"),
      run: () => (platform === undefined ? checkShareRepairStartup() : checkShareRepair(platform)),
    },
    {
      name: "Share unmasking",
      detail: withShares("whole dates, a forgotten digit, refusal", "marked shares"),
      run: () => checkShareUnmasking(fingerprint, platform),
    },
  ];
}

/**
 * The self-test of one host. A class because the host's services are bound once and the checks
 * use them in order; it holds nothing else. Run it again for another report.
 */
export class MnemoCodeSelfTest {
  readonly #host: SelfTestHost;

  constructor(host: SelfTestHost) {
    if (typeof host?.fingerprint !== "function")
      throw ERRORS.create("self-test-host-s-fingerprint-function", []);
    this.#host = host;
  }

  /**
   * The quick checks of the word lists, the fixed vectors and the known answers of every feature,
   * the library's and `features`, which the host builds in; they need nothing from the host: the
   * command line runs them before every command. Throws at the first difference.
   */
  static core(features: readonly SelfTestFeature[] = []): void {
    runCoreChecks();
    for (const startup of FEATURE_STARTUP) startup();
    for (const feature of features) feature.startup();
  }

  /** Every check in order, the host's around the library's; throws at the first that fails. */
  async run(): Promise<SelfTestReport> {
    const host = this.#host;
    const started = performance.now();
    const rows: SelfTestRow[] = [];
    let publicVectors = 0;
    let roundTrips = 0;
    const library: SelfTestCheck[] = [
      {
        name: "Core integrity",
        detail: "word list and fixed forward/reverse vectors",
        run: runCoreChecks,
      },
    ];
    const platform = host.sharePlatform;
    if (platform !== undefined)
      library.push({
        name: "SSKR integrity",
        detail: [
          host.shareLibrary,
          "official and 32-byte recovery, exact creation, transport and refusals",
        ]
          .filter(Boolean)
          .join(", "),
        run: () => checkSskrKnownAnswers(platform),
      });
    library.push(
      {
        name: "Public vectors",
        detail: "versioned JSON file",
        run: async () => {
          publicVectors = await checkPublicVectors(host);
        },
      },
      {
        name: "Representation matrix",
        detail: "all lengths, formats, and modes",
        run: () => {
          roundTrips = checkAllLengthsAndFormats();
        },
      },
      { name: "Date ordering", detail: "deterministic sorting", run: checkDateOrdering },
      ...featureChecks(host),
      ...(host.features ?? []).map((feature) => feature.check),
    );
    for (const check of [...(host.before ?? []), ...library, ...(host.after ?? [])]) {
      const checkStarted = performance.now();
      await check.run();
      rows.push({
        name: check.name,
        detail: check.detail,
        milliseconds: performance.now() - checkStarted,
      });
    }
    return Object.freeze({
      rows: Object.freeze(rows),
      publicVectors,
      roundTrips,
      milliseconds: performance.now() - started,
    });
  }
}
