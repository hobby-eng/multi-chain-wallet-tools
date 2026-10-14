import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@ckd/recovery-sskr-wasm/recovery_sskr_wasm_bg.wasm", async () => ({
  default: readFileSync(
    new URL("../../recovery-sskr-wasm/generated/recovery_sskr_wasm_bg.wasm", import.meta.url),
  ),
}));

import { mnemonicToEntropy } from "@scure/bip39";
import { wordlist as englishWordlist } from "@scure/bip39/wordlists/english.js";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import {
  createSessionIdentity,
  decryptCandidates,
} from "../../recovery-mnemocode/source/core/candidate-encryption.js";
import {
  MAX_CANDIDATE_RECORDS,
  decodeCandidateList,
} from "../../recovery-mnemocode/source/core/candidate-list.js";
import {
  DatesAnswer,
  MAX_SHOWN_MATCHES,
} from "../../recovery-mnemocode/source/core/date-search.js";
import type { RepairedSet } from "../../recovery-mnemocode/source/sskr/joint-repair.js";
import { ShareUnmasking } from "../../recovery-mnemocode/source/sskr/share-unmasking.js";
import { fingerprintWithoutPassphrase } from "../src/fingerprint.js";
import { sskrCodec } from "../src/sskr.js";
import {
  MnemoCodeShares,
  sskrSharePlatform,
  type RestoreRequest,
  type ShareRequest,
} from "../src/mnemocode-shares.js";

// The public BIP39 test phrase; its master fingerprint is 73c5da0a.
const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const FINGERPRINT = "73c5da0a";
const DATES = "23-09-2026";

/** A fixed byte stream: the shares come out the same in every run. */
function fixedRandom(bytes: Uint8Array): void {
  bytes.forEach((_, index) => (bytes[index] = (index * 37 + 11) & 0xff));
}

const shares = new MnemoCodeShares(sskrSharePlatform(sskrCodec()), fixedRandom, (mnemonic) =>
  fingerprintWithoutPassphrase(mnemonic, mnemonicToSeed),
);
const noProgress = (): void => undefined;
const signal = new AbortController().signal;
const request = (answer: string, more: Partial<RestoreRequest> = {}): ShareRequest => ({
  answer,
  mode: "direct",
  dates: "",
  confirmed: false,
  ...more,
});
/** Two of the three shares of MnemoCode's public SSKR vector bip39-128-2-of-3. */
const VECTOR_SHARES = [
  "ur:sskr/goemjzaeadaejoinoyvotkwlptsskispvwbkbwjnamstlubnampf",
  "ur:sskr/goemjzaeadadflihpkmhspcheycndschfhcmkelyvaveiesolrls",
];
const VECTOR_ENTROPY = Uint8Array.from({ length: 16 }, (_, index) => index);
/** The public BIP39 test passphrase. */
const TEST_PASSPHRASE = "TREZOR";
/** Every day of 2026: 365 Seedshift phrases, more than a restore shows. */
const EVERY_DAY = "??-??-2026";
const everyPhraseMatches = async () => ({ matched: true });
/** A share with its eighth word unreadable. */
const marked = (share: string): string =>
  share
    .split(" ")
    .map((word, index) => (index === 7 ? "?" : word))
    .join(" ");

describe("MnemoCode shares in the Deriver", () => {
  it("splits a phrase into checked shares and restores it from any two", async () => {
    const split = await shares.split({
      phrase: PHRASE,
      mode: "direct",
      dates: "",
      threshold: 2,
      count: 3,
      form: "words",
    });
    expect(split.shares).toHaveLength(3);
    expect(split.split).toBe(PHRASE);
    const outcome = await shares.restore(
      request(`${split.shares[2]}\n${split.shares[0]}`),
      noProgress,
      signal,
    );
    expect(outcome.kind).toBe("phrases");
    if (outcome.kind !== "phrases") return;
    expect(outcome.phrases.map((phrase) => phrase.mnemonic)).toEqual([PHRASE]);
  });

  it("repairs an unreadable element with the shares together", async () => {
    const split = await shares.split({
      phrase: PHRASE,
      mode: "direct",
      dates: "",
      threshold: 2,
      count: 3,
      form: "words",
    });
    const answer = `${split.shares[0]}\n${marked(split.shares[1]!)}`;
    const restored = await shares.restore(request(answer), noProgress, signal);
    expect(restored.kind).toBe("phrases");
    if (restored.kind !== "phrases") return;
    expect(restored.phrases[0]!.mnemonic).toBe(PHRASE);
    // What the repair filled in, as data for the page's table: share 2, element 8, its own word.
    expect(restored.phrases[0]!.repairs).toEqual([
      {
        share: 2,
        elements: [{ position: 8, value: split.shares[1]!.split(" ")[7], guess: false }],
      },
    ]);
    const repaired = await shares.repair(request(answer), noProgress, signal);
    expect(repaired.kind).toBe("shares");
    if (repaired.kind !== "shares") return;
    // Each share comes back whole, in its own form, and no phrase is part of the outcome.
    expect(repaired.shares.map((share) => share.text)).toEqual(split.shares.slice(0, 2));
    expect(JSON.stringify(repaired)).not.toContain("abandon");
    // With its SSKR record and its one form, so that it prints as cards (AUD-023-API001).
    expect(repaired.shares.map((share) => share.record)).toEqual(split.records.slice(0, 2));
    expect(repaired.form).toBe("words");
    // Each share says its form, which the page asks whether to show its codes apart.
    expect(repaired.shares.map((share) => share.format)).toEqual(["words", "words"]);
  });

  it("writes complete shares again in another form without a quorum", async () => {
    const split = await shares.split({
      phrase: PHRASE,
      mode: "direct",
      dates: "",
      threshold: 2,
      count: 3,
      form: "words",
    });
    const repaired = await shares.repair(
      { ...request(split.shares[1]!), form: "ur" },
      noProgress,
      signal,
    );
    expect(repaired.kind).toBe("shares");
    if (repaired.kind !== "shares") return;
    expect(repaired.shares[0]!.text).toMatch(/^ur:sskr\//u);
    expect(repaired.shares[0]!.record).toBe(split.records[1]);
    expect(repaired.form).toBe("ur");
    expect(repaired.shares[0]!.format).toBe("ur");
  });

  it("restores a Seedshift phrase with whole dates and searches a forgotten digit", async () => {
    const split = await shares.split({
      phrase: PHRASE,
      mode: "seedshift",
      dates: DATES,
      threshold: 2,
      count: 3,
      form: "colors",
    });
    expect(split.split).not.toBe(PHRASE);
    const answer = split.shares.slice(0, 2).join("\n");
    const whole = await shares.restore(
      request(answer, { mode: "seedshift", dates: DATES }),
      noProgress,
      signal,
    );
    expect(whole.kind === "phrases" && whole.phrases[0]!.mnemonic).toBe(PHRASE);
    // The backup that was split, in the encoded form its shares look like.
    expect(whole.kind === "phrases" && whole.phrases[0]!.backup?.form).toBe("colors");
    // A date with ? needs the wallet: every date gives a valid phrase.
    const unchecked = await shares.restore(
      request(answer, { mode: "seedshift", dates: "2?-09-2026" }),
      noProgress,
      signal,
    );
    expect(unchecked.kind).toBe("trouble");
    const searched = await shares.restore(
      request(answer, {
        mode: "seedshift",
        dates: "2?-09-2026",
        walletCheck: async (mnemonic) => ({
          matched: fingerprintWithoutPassphrase(mnemonic, mnemonicToSeed) === FINGERPRINT,
        }),
      }),
      noProgress,
      signal,
    );
    expect(searched.kind).toBe("phrases");
    if (searched.kind !== "phrases") return;
    expect(searched.phrases.map((phrase) => [phrase.mnemonic, phrase.dates])).toEqual([
      [PHRASE, DATES],
    ]);
  });

  it("refuses a seed phrase typed as a share, and too few shares", async () => {
    await expect(shares.restore(request(PHRASE), noProgress, signal)).rejects.toThrow(
      /not a Shamir share/u,
    );
    const split = await shares.split({
      phrase: PHRASE,
      mode: "direct",
      dates: "",
      threshold: 3,
      count: 5,
      form: "ur",
    });
    const few = await shares.restore(request(split.shares[0]!), noProgress, signal);
    expect(few.kind).toBe("trouble");
  });
});

describe("the candidate list of a share restore", () => {
  /** A Seedshift split with the test dates, in the form a restore reads. */
  async function seedshiftShares(): Promise<{ answer: string; held: string }> {
    const split = await shares.split({
      phrase: PHRASE,
      mode: "seedshift",
      dates: DATES,
      threshold: 2,
      count: 3,
      form: "words",
    });
    return { answer: split.shares.slice(0, 2).join("\n"), held: split.split };
  }

  it("stores the phrase of a quorum with its BIP39 passphrase, to the Scanner's key", async () => {
    const { identity, recipient } = await createSessionIdentity();
    const outcome = await shares.restore(
      {
        ...request(VECTOR_SHARES.join("\n")),
        list: { kind: "key", recipient },
        listPassphrase: TEST_PASSPHRASE,
      },
      noProgress,
      signal,
    );
    expect(outcome.kind).toBe("phrases");
    if (outcome.kind !== "phrases") return;
    expect(outcome.list?.encrypted).toBe(true);
    expect(outcome.list?.records).toBe(1);
    const decoded = decodeCandidateList(await decryptCandidates(outcome.list!.bytes, { identity }));
    expect(decoded.passphrase).toBe(TEST_PASSPHRASE);
    expect(decoded.records.map((record) => record.entropy)).toEqual([VECTOR_ENTROPY]);
  });

  it("stores the phrase of repaired shares", async () => {
    const split = await shares.split({
      phrase: PHRASE,
      mode: "direct",
      dates: "",
      threshold: 2,
      count: 3,
      form: "words",
    });
    const outcome = await shares.restore(
      { ...request(`${split.shares[0]}\n${marked(split.shares[1]!)}`), list: { kind: "none" } },
      noProgress,
      signal,
    );
    expect(outcome.kind).toBe("phrases");
    if (outcome.kind !== "phrases") return;
    const decoded = decodeCandidateList(outcome.list!.bytes);
    expect(decoded.passphrase).toBeUndefined();
    expect(decoded.records.map((record) => record.entropy)).toEqual([
      mnemonicToEntropy(PHRASE, englishWordlist),
    ]);
  });

  it("lists every date match beyond those shown, in the command line's order", async () => {
    const { answer, held } = await seedshiftShares();
    const outcome = await shares.restore(
      {
        ...request(answer, { mode: "seedshift", dates: EVERY_DAY }),
        walletCheck: everyPhraseMatches,
        list: { kind: "none" },
      },
      noProgress,
      signal,
    );
    expect(outcome.kind).toBe("phrases");
    if (outcome.kind !== "phrases") return;
    expect(outcome.phrases).toHaveLength(MAX_SHOWN_MATCHES);
    expect(outcome.list?.records).toBe(365);
    expect(outcome.listFull).toBe(false);
    // What sskr-combine saves: ShareUnmasking's listed phrases, with as many kept as it keeps.
    // A date search reads only the phrase the set holds.
    const set = { mnemonic: held } as unknown as RepairedSet;
    const cli = await new ShareUnmasking({
      mode: "seedshift",
      dates: DatesAnswer.parse(EVERY_DAY, { patterns: true }),
      walletCheck: everyPhraseMatches,
      keep: MAX_CANDIDATE_RECORDS + 1,
    }).unmask([set]);
    expect(cli.kind).toBe("phrases");
    if (cli.kind !== "phrases") return;
    expect(decodeCandidateList(outcome.list!.bytes).records.map((r) => r.entropy)).toEqual(
      cli.listed.map((phrase) => mnemonicToEntropy(phrase, englishWordlist)),
    );
  });

  it("refuses what no list can take before the shares are searched", async () => {
    const { answer } = await seedshiftShares();
    let checks = 0;
    const counting = async () => {
      checks += 1;
      return { matched: true };
    };
    const refusals: [Partial<RestoreRequest>, RegExp][] = [
      [{ list: { kind: "none" }, listPassphrase: "x".repeat(257) }, /longer than 256 bytes/u],
      [{ list: { kind: "none" }, listPassphrase: "\uD800" }, /not valid Unicode text/u],
      [{ list: { kind: "key", recipient: "age1bad" } }, /starts with age1/u],
      [{ list: { kind: "passphrase", passphrase: "short" } }, /at least 12 characters/u],
    ];
    for (const [more, refusal] of refusals)
      await expect(
        shares.restore(
          {
            ...request(answer, { mode: "seedshift", dates: "2?-09-2026" }),
            walletCheck: counting,
            ...more,
          },
          noProgress,
          signal,
        ),
      ).rejects.toThrow(refusal);
    expect(checks).toBe(0);
    const longest = "x".repeat(256);
    const accepted = await shares.restore(
      { ...request(VECTOR_SHARES.join("\n")), list: { kind: "none" }, listPassphrase: longest },
      noProgress,
      signal,
    );
    expect(
      accepted.kind === "phrases" && decodeCandidateList(accepted.list!.bytes).passphrase,
    ).toBe(longest);
  });

  it("writes no list unless one is asked for", async () => {
    const outcome = await shares.restore(request(VECTOR_SHARES.join("\n")), noProgress, signal);
    expect(outcome.kind).toBe("phrases");
    if (outcome.kind !== "phrases") return;
    expect(outcome.list).toBeUndefined();
    expect(outcome.listFull).toBe(false);
    expect(outcome.listEmpty).toBe(false);
    expect(
      outcome.phrases.map((phrase) => mnemonicToEntropy(phrase.mnemonic, englishWordlist)),
    ).toEqual([VECTOR_ENTROPY]);
  });
});
