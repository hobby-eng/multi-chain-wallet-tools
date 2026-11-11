import { beforeAll, describe, expect, it } from "vitest";
import { errorCode } from "@ckd/core/refusal.js";
import { framedPng, syntheticPng, syntheticQrPng } from "../../../test/support/synthetic-png.mjs";
import { decoyKind } from "../src/decoy-qr-text.js";
import { HiddenSeedQr, readHiddenSeedQr } from "../src/hidden-seedqr.js";
import { HIDDEN_SEEDQR_CHECK } from "../src/hidden-seedqr-self-test.js";
import { mnemocodeState, type MnemoCodeBinding } from "../src/mnemocode-engine.js";
import {
  HIDDEN_QR_NOTE,
  HIDDEN_QR_NOTE_WITHOUT_DATES,
  hiddenQrPng,
  readHiddenQrRecord,
} from "../src/mnemocode-hidden-qr.js";
import { loadMnemoCode } from "../src/mnemocode-module.js";
import { decodeStandardSeedQr } from "../src/seedqr.js";

// The public BIP39 test phrase and a synthetic contact (a domain reserved for examples, a London
// number that Ofcom keeps for drama).
const PHRASE = `${"abandon ".repeat(11)}about`;
/** Its Standard SeedQR, by hand: "abandon" is word 0 of the BIP39 list and "about" word 3. */
const DIGITS = `${"0000".repeat(11)}0003`;
const CONTACT = decoyKind("contact").text({
  name: "Ana Ruiz",
  organisation: "Ruiz Studio",
  phone: "+44 20 7946 0000",
  email: "ana@ruiz.example",
});
/** What MnemoCode's visible and hidden texts share at version 40-M (its docs/HIDDEN_QR.md). */
const SHARED_BYTES = 2324;

let binding: MnemoCodeBinding;
beforeAll(async () => {
  binding = await loadMnemoCode();
});

/** The code of what `run` throws, and its message. */
function refusal(run: () => unknown): { code: unknown; message: string } | undefined {
  try {
    run();
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    return { code: "code" in cause ? cause.code : undefined, message: cause.message };
  }
  return undefined;
}

describe("a Standard SeedQR hidden in a decoy QR", () => {
  it("shows ordinary scanners the contact card and gives the Deriver the SeedQR of the phrase", () => {
    using hidden = new HiddenSeedQr(PHRASE, CONTACT);
    expect(hidden.visible).toBe(CONTACT);
    expect(hidden.record).toBe(DIGITS);
    expect(binding.readQrPng(hidden.png)).toBe(CONTACT);
    const digits = readHiddenSeedQr(hidden.png);
    expect(digits).toBe(DIGITS);
    expect(decodeStandardSeedQr(digits ?? "")).toBe(PHRASE);
  });

  it("keeps every kind of decoy as its visible text", () => {
    for (const [kind, values] of [
      ["website", { address: "https://shop.example/" }],
      ["wifi", { ssid: "Lab; 2", security: "WPA", password: "pass:word" }],
      ["location", { latitude: "48.8584", longitude: "-2.2945" }],
    ] as const) {
      const visible = decoyKind(kind).text(values);
      using hidden = new HiddenSeedQr(PHRASE, visible);
      expect(binding.readQrPng(hidden.png)).toBe(visible);
      expect(readHiddenSeedQr(hidden.png)).toBe(DIGITS);
    }
  });

  it("refuses a phrase that is not BIP39 before making any QR", () => {
    expect(() => new HiddenSeedQr(`${"abandon ".repeat(11)}abandon`, CONTACT)).toThrow();
  });

  it("wipes its PNG", () => {
    const hidden = new HiddenSeedQr(PHRASE, CONTACT);
    const png = hidden.png;
    hidden.wipe();
    expect(png.every((byte) => byte === 0)).toBe(true);
  });

  it("refuses a decoy too long to share one QR with the SeedQR, at MnemoCode's limit", () => {
    const most = SHARED_BYTES - DIGITS.length;
    using fits = new HiddenSeedQr(PHRASE, "x".repeat(most));
    expect(readHiddenSeedQr(fits.png)).toBe(DIGITS);
    for (const visible of ["x".repeat(most + 1), "é".repeat(most / 2 + 1), "x".repeat(4000)])
      expect(refusal(() => new HiddenSeedQr(PHRASE, visible))?.code).toBe(
        "export.qr-image.capacity",
      );
  });

  it("refuses an empty decoy, as MnemoCode refuses an empty visible text", () => {
    expect(refusal(() => new HiddenSeedQr(PHRASE, ""))?.code).toBe(
      "export.qr-image.qr-payload-not-empty",
    );
  });
});

describe("reading a SeedQR hidden in a decoy QR", () => {
  it("reads an ordinary SeedQR as none, so that the image is read as any QR", () => {
    const ordinary = binding.qrPng(DIGITS);
    expect(readHiddenSeedQr(ordinary)).toBeUndefined();
  });

  it("reads the digits of a record saved from a file that ends in a line break", () => {
    expect(readHiddenSeedQr(hiddenQrPng(CONTACT, `${DIGITS}\n`))).toBe(DIGITS);
  });

  it("refuses any other hidden record, without repeating it", () => {
    for (const record of [
      "MNC1:direct:indexes:1 1 1 1 1 1 1 1 1 1 1 4",
      DIGITS.slice(4),
      `${DIGITS.slice(1)}x`,
      `${DIGITS} ${DIGITS}`,
    ]) {
      const refused = refusal(() => readHiddenSeedQr(hiddenQrPng(CONTACT, record)));
      expect(refused?.code).toBe("backup.hidden-seedqr.not-seedqr");
      expect(refused?.message).toBe(
        "This QR's hidden record is not a Standard SeedQR. A hidden QR of a MnemoCode backup opens in the MnemoCode tab.",
      );
    }
  });
});

describe("PNGs that MnemoCode's hidden reader does not look into", () => {
  // A phone screenshot's size: 1179 by 2556 pixels, 3 megapixels, within the page's 8 and beyond
  // MnemoCode's 2.
  const [WIDTH, HEIGHT, SCALE] = [1179, 2556, 30];
  const TOO_LARGE =
    "A hidden record is read only from a PNG of at most 4096 pixels a side and 2 megapixels: use the original PNG, or a crop of the QR.";

  it("reads an ordinary SeedQR above 2 megapixels as keeping none, and says why", () => {
    const reasons: string[] = [];
    const screenshot = syntheticQrPng(DIGITS, WIDTH, HEIGHT, SCALE);
    expect(readHiddenSeedQr(screenshot, (reason) => reasons.push(reason))).toBeUndefined();
    expect(readHiddenQrRecord(screenshot, (reason) => reasons.push(reason))).toBeUndefined();
    expect(reasons).toEqual([TOO_LARGE, TOO_LARGE]);
    // Without a listener the reason is dropped, and the PNG still reads as keeping none.
    expect(readHiddenQrRecord(screenshot)).toBeUndefined();
  });

  it("reads a hidden QR above 2 megapixels as keeping none: its record goes unread", () => {
    const reasons: string[] = [];
    const white = syntheticPng(WIDTH, HEIGHT, () => [255, 255, 255]);
    expect(readHiddenQrRecord(white, (reason) => reasons.push(reason))).toBeUndefined();
    expect(reasons).toEqual([TOO_LARGE]);
  });

  it("reads numeric-mode and binary SeedQRs of another encoder as keeping none, silently", () => {
    const reasons: string[] = [];
    const numeric = syntheticQrPng(DIGITS, 330, 330, 10);
    const compact = syntheticQrPng(
      Array.from({ length: 16 }, (_, at) => at * 17),
      330,
      330,
      10,
    );
    for (const png of [numeric, compact])
      expect(readHiddenSeedQr(png, (reason) => reasons.push(reason))).toBeUndefined();
    expect(reasons).toEqual([]);
  });
});

describe("refusals that the hidden reader passes on while MnemoCode is up", () => {
  it("passes on MnemoCode's refusal of a PNG it admits but cannot read, said by no reason", () => {
    // Framed as a PNG, with image data that is no zlib stream.
    const corrupt = framedPng(8, 8, Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8));
    const reasons: string[] = [];
    for (const read of [readHiddenQrRecord, readHiddenSeedQr]) {
      let refused: unknown;
      try {
        read(corrupt, (reason) => reasons.push(reason));
      } catch (cause) {
        refused = cause;
      }
      expect(errorCode(refused)).toBe("cli.qr-input.invalid-png-input");
    }
    expect(reasons).toEqual([]);
    expect(mnemocodeState()).toBe("ready");
  });
});

describe("the note beside a hidden QR", () => {
  it("gives the SeedQR tab MnemoCode's note, without the masking dates it has none of", () => {
    expect(HIDDEN_QR_NOTE).toContain("Never put masking dates or other private information in");
    expect(HIDDEN_QR_NOTE_WITHOUT_DATES).toBe(
      HIDDEN_QR_NOTE.replace("masking dates or other private information", "private information"),
    );
    expect(HIDDEN_QR_NOTE_WITHOUT_DATES).not.toMatch(/dates/u);
  });
});

describe("the hidden SeedQR's self-test check", () => {
  it("passes on this build's MnemoCode", async () => {
    expect(HIDDEN_SEEDQR_CHECK.name).toBe("Hidden SeedQR");
    await HIDDEN_SEEDQR_CHECK.run();
  });
});
