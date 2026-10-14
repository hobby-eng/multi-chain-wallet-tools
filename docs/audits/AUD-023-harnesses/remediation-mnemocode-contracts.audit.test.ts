// AUD-023 remediation re-run of AUD-022-API001, API002 and API003 through the production library
// entry points that the Deriver's workers call unchanged (MnemoCodeSearches, MnemoCodeShares), with
// the Scanner's own importer for the hand-over. Public BIP39/SSKR fixtures and synthetic list
// passphrases only. Copied from AUD-022-harnesses/mnemocode-contracts.audit.test.ts and extended
// with the variants that AUD-022's "required verification" names.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@ckd/recovery-sskr-wasm/recovery_sskr_wasm_bg.wasm", async () => ({
  default: readFileSync(
    new URL(
      "../../../packages/recovery-sskr-wasm/generated/recovery_sskr_wasm_bg.wasm",
      import.meta.url,
    ),
  ),
}));

import { mnemonicToEntropy } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { CandidateListImport } from "../../../apps/discovery-scanner/src/candidate-list-import.js";
import { fingerprintWithoutPassphrase } from "../../../packages/recovery-backup/src/fingerprint.js";
import {
  MnemoCodeSearches,
  type ListProtectionRequest,
} from "../../../packages/recovery-backup/src/mnemocode-search.js";
import {
  MnemoCodeShares,
  sskrSharePlatform,
} from "../../../packages/recovery-backup/src/mnemocode-shares.js";
import { sskrCodec } from "../../../packages/recovery-backup/src/sskr.js";
import {
  createSessionIdentity,
  decryptCandidates,
} from "../../../packages/recovery-mnemocode/source/core/candidate-encryption.js";
import {
  MAX_CANDIDATE_RECORDS,
  decodeCandidateList,
} from "../../../packages/recovery-mnemocode/source/core/candidate-list.js";
import { DatesAnswer } from "../../../packages/recovery-mnemocode/source/core/date-search.js";
import type { RepairedSet } from "../../../packages/recovery-mnemocode/source/sskr/joint-repair.js";
import { ShareUnmasking } from "../../../packages/recovery-mnemocode/source/sskr/share-unmasking.js";

const noProgress = () => undefined;
const signal = new AbortController().signal;
const wallet = {
  evidence: { kind: "master-fingerprint" as const, value: "00000000", network: "mainnet" as const },
  passphrase: "",
};
/** BIP39 all-zero entropy is abandon x11 + about; abandon and ability fail its checksum. */
const ZERO_VALID = `${"abandon ".repeat(11)}abandon|ability`;
const ONE_VALID = `${"abandon ".repeat(11)}about|zoo`;
const ZERO_INDEXES = [...Array<number>(11).fill(0), 3];
const TEN_DATES = "2?-09-2026";
const SYNTHETIC_LIST = { kind: "passphrase", passphrase: "synthetic list passphrase" } as const;
const PUBLIC_PHRASE = `${"abandon ".repeat(11)}about`;
/** Two of the three shares of MnemoCode's public SSKR vector bip39-128-2-of-3 (entropy 00..0f). */
const VECTOR_SHARES = [
  "ur:sskr/goemjzaeadaejoinoyvotkwlptsskispvwbkbwjnamstlubnampf",
  "ur:sskr/goemjzaeadadflihpkmhspcheycndschfhcmkelyvaveiesolrls",
];
const VECTOR_ENTROPY = Uint8Array.from({ length: 16 }, (_, index) => index);
/** The public BIP39 test passphrase. */
const TREZOR = "TREZOR";

function counting(matched: boolean) {
  let checks = 0;
  const searches = new MnemoCodeSearches({
    checkFor: () => async () => {
      checks += 1;
      return { matched };
    },
  });
  return { searches, checks: () => checks };
}

function fixedRandom(bytes: Uint8Array): void {
  bytes.forEach((_, index) => (bytes[index] = (index * 37 + 11) & 0xff));
}
const shares = new MnemoCodeShares(sskrSharePlatform(sskrCodec()), fixedRandom, (mnemonic) =>
  fingerprintWithoutPassphrase(mnemonic, mnemonicToSeed),
);

describe("AUD-022-API001 re-run: an empty completed search with a list asked for", () => {
  it("keeps a completed word search with no checksum-valid candidate, for every protection", async () => {
    const recipient = (await createSessionIdentity()).recipient;
    const protections: ListProtectionRequest[] = [
      { kind: "none" },
      SYNTHETIC_LIST,
      { kind: "key", recipient },
    ];
    for (const list of protections) {
      const { searches } = counting(false);
      const outcome = await searches.words(
        { text: ZERO_VALID, kind: "unknown-words", list },
        noProgress,
        signal,
      );
      expect(outcome).toMatchObject({ count: 0, matched: 0, listEmpty: true, listFull: false });
      expect(outcome.list).toBeUndefined();
    }
  });

  it("keeps a completed date search whose ten candidates match no wallet", async () => {
    const recipient = (await createSessionIdentity()).recipient;
    for (const list of [{ kind: "none" } as const, SYNTHETIC_LIST, { kind: "key", recipient }]) {
      const { searches, checks } = counting(false);
      const outcome = await searches.dates(
        { indexes: ZERO_INDEXES, mode: "seedshift", dates: TEN_DATES, wallet, list },
        noProgress,
        signal,
      );
      if ("question" in outcome) throw new Error(outcome.question);
      expect(outcome).toMatchObject({ count: 10, matched: 0, listEmpty: true, listFull: false });
      expect(outcome.list).toBeUndefined();
      // Every candidate is compared; DateSearch.pace() also times a few wallet checks first.
      expect(checks()).toBeGreaterThanOrEqual(10);
    }
  });

  it("positive control: one candidate gives a one-record list that decrypts to the vector", async () => {
    const { identity, recipient } = await createSessionIdentity();
    const { searches } = counting(false);
    const outcome = await searches.words(
      { text: ONE_VALID, kind: "unknown-words", list: { kind: "key", recipient } },
      noProgress,
      signal,
    );
    expect(outcome.listEmpty).toBe(false);
    const decoded = decodeCandidateList(await decryptCandidates(outcome.list!.bytes, { identity }));
    expect(decoded.records.map((record) => record.entropy)).toEqual([new Uint8Array(16)]);
  });

  it("no-list control: the same empty searches report no list at all", async () => {
    const { searches } = counting(false);
    const words = await searches.words(
      { text: ZERO_VALID, kind: "unknown-words" },
      noProgress,
      signal,
    );
    expect(words).toMatchObject({ count: 0, listEmpty: false, listFull: false });
  });
});

describe("AUD-022-API002 re-run: the stored BIP39 passphrase is judged before any work", () => {
  const refused: [string, string][] = [
    ["257 ASCII bytes (the AUD-022 reproduction)", "x".repeat(257)],
    ["258 UTF-8 bytes in 129 characters", "é".repeat(129)],
    ["a lone surrogate", "abc\uD800"],
  ];
  for (const [name, listPassphrase] of refused) {
    it(`refuses ${name} with zero wallet checks, in words and dates`, async () => {
      const { searches, checks } = counting(true);
      await expect(
        searches.words(
          {
            text: ONE_VALID,
            kind: "unknown-words",
            wallet,
            list: { kind: "none" },
            listPassphrase,
          },
          noProgress,
          signal,
        ),
      ).rejects.toThrow();
      await expect(
        searches.dates(
          {
            indexes: ZERO_INDEXES,
            mode: "seedshift",
            dates: TEN_DATES,
            wallet,
            list: SYNTHETIC_LIST,
            listPassphrase,
          },
          noProgress,
          signal,
        ),
      ).rejects.toThrow();
      expect(checks()).toBe(0);
    });
  }

  it("refuses the wallet's own long passphrase when the list would store it", async () => {
    const { searches, checks } = counting(true);
    await expect(
      searches.dates(
        {
          indexes: ZERO_INDEXES,
          mode: "seedshift",
          dates: TEN_DATES,
          wallet: { ...wallet, passphrase: "x".repeat(257) },
          list: { kind: "none" },
        },
        noProgress,
        signal,
      ),
    ).rejects.toThrow(/longer than 256 bytes/u);
    expect(checks()).toBe(0);
  });

  it("accepts exactly 256 bytes (ASCII and two-byte), and stores it", async () => {
    for (const listPassphrase of ["x".repeat(256), "é".repeat(128)]) {
      const { searches } = counting(false);
      const outcome = await searches.words(
        { text: ONE_VALID, kind: "unknown-words", list: { kind: "none" }, listPassphrase },
        noProgress,
        signal,
      );
      expect(decodeCandidateList(outcome.list!.bytes).passphrase).toBe(listPassphrase);
    }
  });

  it("no-list path: a long wallet passphrase is checked, as BIP39 allows", async () => {
    const { searches, checks } = counting(true);
    const outcome = await searches.words(
      {
        text: ONE_VALID,
        kind: "unknown-words",
        wallet: { ...wallet, passphrase: "x".repeat(300) },
      },
      noProgress,
      signal,
    );
    expect(checks()).toBe(1);
    expect(outcome.list).toBeUndefined();
  });

  it("share restore refuses an unstorable list passphrase before the shares are restored", async () => {
    let checks = 0;
    const split = await shares.split({
      phrase: PUBLIC_PHRASE,
      mode: "seedshift",
      dates: "23-09-2026",
      threshold: 2,
      count: 3,
      form: "words",
    });
    await expect(
      shares.restore(
        {
          answer: split.shares.slice(0, 2).join("\n"),
          mode: "seedshift",
          dates: TEN_DATES,
          confirmed: false,
          walletCheck: async () => {
            checks += 1;
            return { matched: true };
          },
          list: { kind: "none" },
          listPassphrase: "é".repeat(129),
        },
        noProgress,
        signal,
      ),
    ).rejects.toThrow(/longer than 256 bytes/u);
    expect(checks).toBe(0);
  });
});

describe("AUD-022-API003 re-run: SSKR Restore writes the candidate list sskr-combine writes", () => {
  it("normal quorum: the vector shares give a protected list with the BIP39 passphrase", async () => {
    const scanner = new CandidateListImport();
    const recipient = await scanner.recipient();
    const outcome = await shares.restore(
      {
        answer: VECTOR_SHARES.join("\n"),
        mode: "direct",
        dates: "",
        confirmed: false,
        list: { kind: "key", recipient },
        listPassphrase: TREZOR,
      },
      noProgress,
      signal,
    );
    expect(outcome.kind).toBe("phrases");
    if (outcome.kind !== "phrases") return;
    expect(outcome.list?.encrypted).toBe(true);
    // The Scanner's own importer opens it: one candidate, the vector entropy, the stored passphrase.
    const bytes = outcome.list!.bytes.slice();
    const opened = await scanner.open({ arrayBuffer: async () => bytes.buffer });
    expect(opened).toEqual({ count: 1, passphrases: "list" });
    const inputs = scanner.inputs();
    expect(inputs.map((input) => input.passphrase)).toEqual([TREZOR]);
    expect(mnemonicToEntropy(inputs[0]!.mnemonic, wordlist)).toEqual(VECTOR_ENTROPY);
    scanner.clear();
  });

  it("repaired share: a share with an unreadable element still gives the list", async () => {
    const split = await shares.split({
      phrase: PUBLIC_PHRASE,
      mode: "direct",
      dates: "",
      threshold: 2,
      count: 3,
      form: "words",
    });
    const marked = split.shares[1]!.split(" ")
      .map((word, index) => (index === 7 ? "?" : word))
      .join(" ");
    const outcome = await shares.restore(
      {
        answer: `${split.shares[0]}\n${marked}`,
        mode: "direct",
        dates: "",
        confirmed: false,
        list: SYNTHETIC_LIST,
      },
      noProgress,
      signal,
    );
    expect(outcome.kind).toBe("phrases");
    if (outcome.kind !== "phrases") return;
    const scanner = new CandidateListImport();
    const bytes = outcome.list!.bytes.slice();
    const opened = await scanner.open(
      { arrayBuffer: async () => bytes.buffer },
      SYNTHETIC_LIST.passphrase,
    );
    expect(opened).toEqual({ count: 1, passphrases: "none" });
    expect(scanner.inputs()[0]!.mnemonic).toBe(PUBLIC_PHRASE);
    scanner.clear();
  });

  it("bounded dates: ten candidates in the order and number that ShareUnmasking keeps", async () => {
    const split = await shares.split({
      phrase: PUBLIC_PHRASE,
      mode: "seedshift",
      dates: "23-09-2026",
      threshold: 2,
      count: 3,
      form: "words",
    });
    const everyPhrase = async () => ({ matched: true });
    const outcome = await shares.restore(
      {
        answer: split.shares.slice(0, 2).join("\n"),
        mode: "seedshift",
        dates: TEN_DATES,
        confirmed: false,
        walletCheck: everyPhrase,
        list: { kind: "none" },
        listPassphrase: TREZOR,
      },
      noProgress,
      signal,
    );
    expect(outcome.kind).toBe("phrases");
    if (outcome.kind !== "phrases") return;
    const decoded = decodeCandidateList(outcome.list!.bytes);
    // What the command line's restorePhrases saves: ShareUnmasking's listed phrases.
    const cli = await new ShareUnmasking({
      mode: "seedshift",
      dates: DatesAnswer.parse(TEN_DATES, { patterns: true }),
      walletCheck: everyPhrase,
      keep: MAX_CANDIDATE_RECORDS + 1,
    }).unmask([{ mnemonic: split.split } as unknown as RepairedSet]);
    if (cli.kind !== "phrases") throw new Error("ShareUnmasking found no phrase");
    expect(cli.listed).toHaveLength(10);
    expect(decoded.passphrase).toBe(TREZOR);
    expect(decoded.records.map((record) => record.entropy)).toEqual(
      cli.listed.map((phrase) => mnemonicToEntropy(phrase, wordlist)),
    );
    // The true phrase is among them.
    expect(cli.listed).toContain(PUBLIC_PHRASE);
  });

  it("a wallet that matches no date gives no list and no crash (trouble, as the CLI stops)", async () => {
    const split = await shares.split({
      phrase: PUBLIC_PHRASE,
      mode: "seedshift",
      dates: "23-09-2026",
      threshold: 2,
      count: 3,
      form: "words",
    });
    const outcome = await shares.restore(
      {
        answer: split.shares.slice(0, 2).join("\n"),
        mode: "seedshift",
        dates: TEN_DATES,
        confirmed: false,
        walletCheck: async () => ({ matched: false }),
        list: { kind: "none" },
      },
      noProgress,
      signal,
    );
    expect(outcome.kind).toBe("trouble");
  });
});
