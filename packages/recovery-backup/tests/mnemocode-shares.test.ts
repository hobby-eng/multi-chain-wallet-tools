import { beforeAll, describe, expect, it } from "vitest";
import { loadMnemoCode } from "../src/mnemocode-module.js";
import type { MnemoCodeBinding } from "../src/mnemocode-engine.js";
import {
  MnemoCodeShareJobs,
  splitShares,
  typedShares,
  type RestoreOutcome,
} from "../src/mnemocode-shares.js";

// Public BIP39 test phrases, MnemoCode's published date example and synthetic passphrases only.
const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const FINGERPRINT = "73c5da0a";
const DATES = "23-09-2026";
const ignore = (): void => undefined;

let binding: MnemoCodeBinding;
let jobs: MnemoCodeShareJobs;
beforeAll(async () => {
  binding = await loadMnemoCode();
  jobs = new MnemoCodeShareJobs(binding);
});

function phrases(outcome: RestoreOutcome): string[] {
  if (outcome.kind !== "phrases") throw new Error(`Expected phrases, got ${outcome.kind}.`);
  return outcome.phrases.map((phrase) => phrase.mnemonic);
}

describe("MnemoCode shares in the Deriver", () => {
  it("splits a phrase into checked shares, with UR records for the cards, and restores it from two", () => {
    const split = splitShares({
      phrase: PHRASE,
      mode: "direct",
      dates: undefined,
      threshold: 2,
      count: 3,
      form: "words",
    });
    expect(split.shares).toHaveLength(3);
    expect(split.records.every((record) => record.startsWith("ur:sskr/"))).toBe(true);
    expect(split.keepingNote("files")).toMatch(/2 of the 3 shares/u);
    const restored = jobs.restore(
      {
        answer: `${split.shares[0]}\n${split.shares[2]}`,
        mode: "direct",
        dates: undefined,
        confirmed: false,
      },
      ignore,
    );
    expect(phrases(restored)).toEqual([PHRASE]);
  });

  it("reads the shares of one answer by line or by ;", () => {
    expect(typedShares(" a ;b\n\nc ")).toEqual(["a", "b", "c"]);
  });

  it("repairs an unreadable element with the shares together, and says what it filled in", () => {
    const { shares } = splitShares({
      phrase: PHRASE,
      mode: "direct",
      dates: undefined,
      threshold: 2,
      count: 3,
      form: "words",
    });
    const damaged = shares[0]!.split(" ");
    damaged[5] = "?";
    const restored = jobs.restore(
      {
        answer: [damaged.join(" "), shares[1]].join("\n"),
        mode: "direct",
        dates: undefined,
        confirmed: false,
      },
      ignore,
    );
    expect(phrases(restored)).toEqual([PHRASE]);
    if (restored.kind === "phrases")
      expect(restored.phrases[0]?.repairs.join(" ")).toMatch(/Share 1: element 6/u);
    const repaired = jobs.repair(
      {
        answer: [damaged.join(" "), shares[1]].join("\n"),
        mode: "direct",
        dates: undefined,
        confirmed: false,
      },
      ignore,
    );
    expect(repaired.kind).toBe("shares");
    if (repaired.kind === "shares") {
      expect(repaired.shares.map((share) => share.text)).toContain(shares[0]);
      expect(repaired.shares.every((share) => share.record.startsWith("ur:sskr/"))).toBe(true);
    }
  });

  it("restores a Seedshift phrase with whole dates, and searches a forgotten digit with the wallet", () => {
    const { shares } = splitShares({
      phrase: PHRASE,
      mode: "seedshift",
      dates: DATES,
      threshold: 2,
      count: 3,
      form: "ur",
    });
    const answer = shares.slice(0, 2).join("\n");
    expect(
      phrases(jobs.restore({ answer, mode: "seedshift", dates: DATES, confirmed: false }, ignore)),
    ).toEqual([PHRASE]);
    // Without a wallet, every guessed date gives a valid phrase: MnemoCode asks for one.
    expect(
      jobs.restore({ answer, mode: "seedshift", dates: "2?-09-2026", confirmed: false }, ignore)
        .kind,
    ).toBe("trouble");
    const found = jobs.restore(
      {
        answer,
        mode: "seedshift",
        dates: "2?-09-2026",
        confirmed: false,
        wallet: {
          evidence: { kind: "master-fingerprint", value: FINGERPRINT, network: "mainnet" },
          passphrase: "",
        },
      },
      ignore,
    );
    expect(phrases(found)).toEqual([PHRASE]);
    if (found.kind === "phrases") expect(found.warnings.join(" ")).toMatch(/fingerprint/u);
  });

  it("stores the restored phrase in a candidate list to the Scanner's key", () => {
    const { shares } = splitShares({
      phrase: PHRASE,
      mode: "direct",
      dates: undefined,
      threshold: 2,
      count: 3,
      form: "words",
    });
    using session = binding.SessionIdentity.create();
    const restored = jobs.restore(
      {
        answer: shares.slice(0, 2).join("\n"),
        mode: "direct",
        dates: undefined,
        confirmed: false,
        list: { kind: "key", recipient: session.recipient },
        listPassphrase: "TREZOR",
      },
      ignore,
    );
    if (restored.kind !== "phrases" || restored.list === undefined)
      throw new Error("No list was written.");
    using opened = binding.OpenedCandidateList.read(session.decrypt(restored.list.bytes));
    expect([opened.phrase(0), opened.passphrase(0)]).toEqual([PHRASE, "TREZOR"]);
  });

  it("refuses too few shares", () => {
    const { shares } = splitShares({
      phrase: PHRASE,
      mode: "direct",
      dates: undefined,
      threshold: 2,
      count: 3,
      form: "words",
    });
    const outcome = jobs.restore(
      { answer: shares[0]!, mode: "direct", dates: undefined, confirmed: false },
      ignore,
    );
    expect(outcome.kind).toBe("trouble");
  });
});
