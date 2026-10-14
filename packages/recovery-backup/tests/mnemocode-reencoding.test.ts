// Public BIP39 and MnemoCode fixtures only; no PBKDF2, card renderer or wallet provider runs.
import { describe, expect, it, vi } from "vitest";
import { MnemoCodeReEncoding, type ReEncodingInput } from "../src/mnemocode-reencoding.js";
import { ENCODED_FORMATS, encodeMnemoCode, parseMnemoCodeDates } from "../src/mnemocode.js";
import {
  NOT_CONFIRMED,
  LAST_WORD_NEEDED,
} from "../../recovery-mnemocode/source/core/re-encoding.js";
import { FINGERPRINT_WARNING } from "../../recovery-mnemocode/source/core/wallet-check.js";

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

describe("MnemoCode browser re-encoding confirmation", () => {
  it("reproduces the published old backup before handing the same phrase to Encode", () => {
    const session = MnemoCodeReEncoding.of(OLD);
    expect(session.phrase).toBe(PUBLIC_PHRASE);
    expect(() => session.confirmedPhrase()).toThrow(NOT_CONFIRMED);
    session.confirmByPerson();
    const next = encodeMnemoCode(session.confirmedPhrase(), "direct", "unicode");
    // Published BIP39 Chinese word-list entries for abandon/about, independent of this encoder.
    expect(next.payload.replace(/\s/gu, "")).toBe(`${"7684".repeat(11)}5728`);
    expect(next.mnemonic).toBe(PUBLIC_PHRASE);
  });

  it.each(ENCODED_FORMATS)("reads an MNC1 %s record by its own mode and format", (format) => {
    const encoded = encodeMnemoCode(PUBLIC_PHRASE, "seedshift", format, parseMnemoCodeDates(DATE));
    const session = MnemoCodeReEncoding.of({
      ...OLD,
      input: encoded.record,
      mode: "direct",
      format: "auto",
    });
    expect(session.phrase).toBe(PUBLIC_PHRASE);
  });

  it("ignores hidden old dates for a Direct record through the shared reader", () => {
    const record = encodeMnemoCode(PUBLIC_PHRASE, "direct", "indexes").record;
    expect(MnemoCodeReEncoding.of({ ...OLD, input: record, dates: "not a date" }).phrase).toBe(
      PUBLIC_PHRASE,
    );
  });

  it("leaves a wrong Seedshift date unconfirmed even when its checksum is valid", async () => {
    const session = MnemoCodeReEncoding.of({ ...OLD, dates: "24-09-2026" });
    expect(session.phrase).not.toBe(PUBLIC_PHRASE);
    const compared = vi.fn(async () => ({ matched: false }));
    await session.confirmByWallet(
      {
        evidence: { kind: "master-fingerprint", value: "73c5da0a", network: "mainnet" },
        passphrase: "TREZOR",
      },
      compared,
    );
    expect(compared).toHaveBeenCalledWith({
      type: "reencoding-wallet",
      mnemonic: session.phrase,
      wallet: {
        evidence: { kind: "master-fingerprint", value: "73c5da0a", network: "mainnet" },
        passphrase: "TREZOR",
      },
    });
    expect(() => session.confirmedPhrase()).toThrow(NOT_CONFIRMED);
  });

  it("preserves a matching fingerprint's warning rather than turning it into proof", async () => {
    const session = MnemoCodeReEncoding.of(OLD);
    const answer = await session.confirmByWallet(
      {
        evidence: { kind: "master-fingerprint", value: "73c5da0a", network: "mainnet" },
        passphrase: "",
      },
      async () => ({ matched: true, warning: FINGERPRINT_WARNING }),
    );
    expect(answer.warning).toBe(FINGERPRINT_WARNING);
    expect(session.confirmation?.by).toBe("wallet");
    expect(session.confirmedPhrase()).toBe(PUBLIC_PHRASE);
  });

  it("requires the original final word for a replaced-word legacy backup", () => {
    const encoded = encodeMnemoCode(
      PUBLIC_PHRASE,
      "seedshift-legacy-valid",
      "indexes",
      parseMnemoCodeDates(DATE),
    );
    const input = { ...OLD, input: encoded.record };
    expect(() => MnemoCodeReEncoding.of(input)).toThrow(LAST_WORD_NEEDED);
    expect(MnemoCodeReEncoding.of({ ...input, lastWord: "about" }).phrase).toBe(PUBLIC_PHRASE);
  });

  it("keeps the declared word count when printed codes include decorative decoys", () => {
    const session = MnemoCodeReEncoding.of({ ...OLD, input: MASKED_NUMBERS + " 1 2 3", words: 12 });
    expect(session.phrase).toBe(PUBLIC_PHRASE);
  });
});
