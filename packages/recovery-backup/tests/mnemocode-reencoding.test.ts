// Public BIP39 and MnemoCode fixtures only.
import { beforeAll, describe, expect, it } from "vitest";
import { loadMnemoCode } from "../src/mnemocode-module.js";
import {
  MnemoCodeReEncoding,
  MnemoCodeReEncodingDraft,
  MnemoCodeReEncodingError,
  type ReEncodingInput,
} from "../src/mnemocode-reencoding.js";
import { ENCODED_FORMATS, encodeMnemoCode } from "../src/mnemocode.js";

const PUBLIC_PHRASE = `${"abandon ".repeat(11)}about`;
const DATE = "23-09-2026";
// checksum-valid-seedshift-12 in MnemoCode's published mnemocode-v1.json.
const MASKED_NUMBERS = "2027 10 24 2027 10 24 2027 10 24 2027 10 377";
const OLD: ReEncodingInput = {
  input: MASKED_NUMBERS,
  mode: "seedshift",
  format: "indexes",
  dates: DATE,
};
const FINGERPRINT = {
  evidence: { kind: "master-fingerprint", value: "73c5da0a", network: "mainnet" },
  passphrase: "",
} as const;

beforeAll(async () => {
  await loadMnemoCode();
});

describe("MnemoCode re-encoding confirmation", () => {
  it("reproduces the published old backup, and gives the phrase only once confirmed", () => {
    using session = MnemoCodeReEncoding.of(OLD);
    expect(session.phrase).toBe(PUBLIC_PHRASE);
    expect(() => session.confirmedPhrase()).toThrow();
    session.confirmByPerson();
    expect(session.confirmation).toBe("person");
    expect(session.confirmedPhrase()).toBe(PUBLIC_PHRASE);
  });

  it.each(ENCODED_FORMATS)("reads an MNC1 %s record by its own mode and form", (format) => {
    const encoded = encodeMnemoCode(PUBLIC_PHRASE, "seedshift", format, DATE);
    using session = MnemoCodeReEncoding.of({
      ...OLD,
      input: encoded.record,
      mode: "direct",
      format: "auto",
    });
    expect(session.phrase).toBe(PUBLIC_PHRASE);
  });

  it("ignores hidden old dates for a Direct record", () => {
    const record = encodeMnemoCode(PUBLIC_PHRASE, "direct", "unicode", undefined).record;
    using session = MnemoCodeReEncoding.of({ ...OLD, input: record, dates: "not a date" });
    expect(session.phrase).toBe(PUBLIC_PHRASE);
  });

  it("confirms by the wallet only where it matches, keeping a fingerprint's warning", () => {
    using wrong = MnemoCodeReEncoding.of({ ...OLD, dates: "24-09-2026" });
    expect(wrong.phrase).not.toBe(PUBLIC_PHRASE);
    expect(wrong.confirmByWallet(FINGERPRINT).matched).toBe(false);
    expect(wrong.confirmation).toBeUndefined();
    using right = MnemoCodeReEncoding.of(OLD);
    const match = right.confirmByWallet(FINGERPRINT);
    expect(match.matched).toBe(true);
    expect(match.warning).toMatch(/fingerprint/u);
    expect(right.confirmation).toBe("wallet");
    expect(right.confirmationLine(FINGERPRINT)).not.toBe("");
    expect(right.confirmedPhrase()).toBe(PUBLIC_PHRASE);
  });

  it("refuses every use once wiped, and a draft opens fresh sessions until it is wiped", () => {
    const draft = new MnemoCodeReEncodingDraft(OLD);
    const session = draft.open();
    session.wipe();
    expect(() => session.phrase).toThrow(MnemoCodeReEncodingError);
    using again = draft.open();
    expect(again.phrase).toBe(PUBLIC_PHRASE);
    draft.wipe();
    expect(() => draft.open()).toThrow();
  });
});
