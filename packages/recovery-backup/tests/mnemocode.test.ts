import { entropyToMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { beforeAll, describe, expect, it } from "vitest";
import { loadMnemoCode } from "../src/mnemocode-module.js";
import { mnemocodeCode } from "../src/mnemocode-engine.js";
import {
  decodeMnemoCode,
  effectiveMnemoCodeMode,
  encodeMnemoCode,
  ENCODED_FORMATS,
  MNEMOCODE_VERSION,
  mnemoCodeEncodedFingerprint,
  mnemoCodeFormAndMode,
  mnemoCodeRecordHeader,
  readMnemoCodeBackup,
} from "../src/mnemocode.js";
import { alwaysMasked } from "../src/mnemocode-facts.js";

// Public BIP39 test phrases and MnemoCode's published date-shift example only.
const zeroMnemonic =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const dates = "23-09-2026";

beforeAll(async () => {
  await loadMnemoCode();
});

describe("MnemoCode through its WebAssembly", () => {
  it("pins the version and published direct vectors", () => {
    expect(MNEMOCODE_VERSION).toMatch(/^\d+\.\d+\.\d+$/u);
    expect(encodeMnemoCode(zeroMnemonic, "direct", "unicode", undefined).payload).toBe(
      "768476847684768476847684768476847684768476845728",
    );
    const colors = encodeMnemoCode(zeroMnemonic, "direct", "colors", undefined);
    expect(colors.payload).toBe("#000064 #1EAB91 #3D0964 #5BB491 #7A1264 #98BD91 #B71B64 #D5C694");
    expect(colors.colors).toEqual(colors.payload.split(" "));
  });

  it("writes English words and word numbers only masked", () => {
    for (const format of ["english", "indexes"] as const) {
      expect(alwaysMasked(format)).toBe(true);
      let refusal: unknown;
      try {
        encodeMnemoCode(zeroMnemonic, "direct", format, undefined);
      } catch (cause) {
        refusal = cause;
      }
      expect(mnemocodeCode(refusal)).toBe("core.encoded-backup.form-always-masked");
    }
  });

  it("gives the palette of colours of a colour Unicode backup", () => {
    const encoded = encodeMnemoCode(zeroMnemonic, "direct", "colors-unicode", undefined);
    expect(encoded.payload).toMatch(/^(?:[0-9A-F]{4})+$/u);
    expect(encoded.colors).toEqual(
      encodeMnemoCode(zeroMnemonic, "direct", "colors", undefined).payload.split(" "),
    );
  });

  it("matches the published checksum-valid Seedshift vector", () => {
    const encoded = encodeMnemoCode(zeroMnemonic, "seedshift", "english", dates);
    expect(encoded.payload).toBe(
      "wool abuse actual wool abuse actual wool abuse actual wool abuse congress",
    );
    expect(encoded.checksumValid).toBe(true);
    expect(encoded.originalFingerprint).toBe("73c5da0a");
    expect(
      decodeMnemoCode(encoded.record, { mode: "direct", format: "auto", dates }).mnemonic,
    ).toBe(zeroMnemonic);
  });

  it("matches the documented legacy Seedshift vector", () => {
    const source = "oppose duck hello neglect reveal key humor mosquito road evoke flock hedgehog";
    const legacyDates = "10-07-1963 27-04-1956 31-01-1994";
    const encoded = encodeMnemoCode(source, "seedshift-legacy", "english", legacyDates);
    expect(encoded.payload).toBe(
      "mosquito dust hotel maximum rich kitten hair mother salute dream flush hospital",
    );
    expect(encoded.validLastWord?.phrase.split(" ").slice(0, -1)).toEqual(
      encoded.payload.split(" ").slice(0, -1),
    );
    expect(
      decodeMnemoCode(encoded.record, { mode: "direct", format: "auto", dates: legacyDates })
        .mnemonic,
    ).toBe(source);
  });

  it.each([16, 20, 24, 28, 32])(
    "round-trips every form at %i entropy bytes in each mode that takes it",
    (size) => {
      const mnemonic = entropyToMnemonic(
        Uint8Array.from({ length: size }, (_, index) => index),
        wordlist,
      );
      for (const format of ENCODED_FORMATS) {
        for (const mode of ["direct", "seedshift", "seedshift-legacy"] as const) {
          if (mode === "direct" && alwaysMasked(format)) continue;
          const given = mode === "direct" ? undefined : dates;
          const encoded = encodeMnemoCode(mnemonic, mode, format, given);
          expect(
            decodeMnemoCode(encoded.record, { mode: "direct", format: "auto", dates: given })
              .mnemonic,
          ).toBe(mnemonic);
        }
      }
    },
  );

  it.each([
    [16, 128],
    [32, 8],
  ])("lists the legacy valid-last-word set for %i entropy bytes", (size, count) => {
    const mnemonic = entropyToMnemonic(
      Uint8Array.from({ length: size }, (_, index) => index),
      wordlist,
    );
    const encoded = encodeMnemoCode(mnemonic, "seedshift-legacy-valid", "colors", dates);
    const decoded = decodeMnemoCode(encoded.record, { mode: "direct", format: "auto", dates });
    expect(decoded.mode).toBe("seedshift-legacy-valid");
    expect(decoded.candidates).toHaveLength(count);
    expect(decoded.candidates).toContain(mnemonic);
  });

  it("detects raw forms and refuses ambiguous input", () => {
    for (const format of ["unicode", "colors", "colors-unicode"] as const) {
      const payload = encodeMnemoCode(zeroMnemonic, "direct", format, undefined).payload;
      using reading = readMnemoCodeBackup(payload);
      expect(reading.forms(undefined)).toEqual([format]);
    }
    const ambiguous = "76 84 57 28 90 19 59 27 62 11 89 81 66 42 75 28 50 11 52 30 57 30 62 10";
    expect(() => decodeMnemoCode(ambiguous, { mode: "seedshift", format: "auto", dates })).toThrow(
      /ambiguous/u,
    );
  });

  it("refuses oversized input, missing Seedshift dates and dates without Seedshift", () => {
    expect(() => readMnemoCodeBackup("a".repeat(64 * 1024 + 1))).toThrow(
      expect.objectContaining({ code: "wallet.mnemocode-input.too-large" }),
    );
    expect(() => encodeMnemoCode(zeroMnemonic, "seedshift", "english", undefined)).toThrow();
    // A record of a Direct backup reads the same with dates left in the field.
    const record = encodeMnemoCode(zeroMnemonic, "direct", "unicode", undefined).record;
    expect(decodeMnemoCode(record, { mode: "seedshift", format: "auto", dates }).mnemonic).toBe(
      zeroMnemonic,
    );
  });

  it("refuses a Shamir share where an encoded seed phrase is read, naming where shares are read", () => {
    // A share of the published SSKR test set (sskr.test.ts).
    const share = "ur:sskr/gogrrsbyadaefmnlbnctaaecvoqdfnjpbzecstfgaxtifpsskbfw";
    expect(() => readMnemoCodeBackup(share)).toThrow(/MnemoCode's Restore tab/u);
  });

  it("lets a record decide the mode, and gives the codes' fingerprint before the dates", () => {
    const encoded = encodeMnemoCode(zeroMnemonic, "seedshift", "english", dates);
    expect(mnemoCodeRecordHeader(encoded.record)).toEqual({ mode: "seedshift", format: "english" });
    expect(mnemoCodeRecordHeader(encoded.payload)).toBeUndefined();
    expect(effectiveMnemoCodeMode(encoded.record, "direct")).toBe("seedshift");
    expect(effectiveMnemoCodeMode(encoded.payload, "direct")).toBe("direct");
    expect(mnemoCodeFormAndMode(encoded.record, "direct", "auto")).toEqual({
      format: "english",
      mode: "seedshift",
    });
    expect(mnemoCodeEncodedFingerprint(encoded.record, "direct", "auto")).toBe(
      encoded.encodedFingerprint,
    );
    expect(mnemoCodeEncodedFingerprint("wool abuse", "seedshift", "english")).toBeUndefined();
  });

  it("gives no encoded fingerprint for the Original Seedshift, whose codes are a phrase by chance", () => {
    const encoded = encodeMnemoCode(zeroMnemonic, "seedshift-legacy", "english", dates);
    expect(encoded.payload).toBe(
      "wool abuse actual wool abuse actual wool abuse actual wool abuse addict",
    );
    expect(encoded.checksumValid).toBe(false);
    expect(encoded.encodedFingerprint).toBeUndefined();
    expect(mnemoCodeEncodedFingerprint(encoded.record, "direct", "auto")).toBeUndefined();
  });

  it("names the shorter phrases that codes ending with decoys give", () => {
    const encoded = encodeMnemoCode(zeroMnemonic, "direct", "unicode", undefined);
    // Three more codes after the twelve, as printed cards end with decoys.
    const withDecoys = `${encoded.payload}768476847684`;
    const decoded = decodeMnemoCode(withDecoys, { mode: "direct", format: "unicode" });
    expect(decoded.checksumValid).toBe(false);
    expect(decoded.shorter).toContainEqual({ words: 12, mnemonic: zeroMnemonic });
  });
});
