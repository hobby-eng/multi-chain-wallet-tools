import { beforeAll, describe, expect, it } from "vitest";
import { literalJpeg } from "@ckd/test-support/synthetic-carrier.js";
import { loadMnemoCode } from "../src/mnemocode-module.js";
import type { MnemoCodeBinding } from "../src/mnemocode-engine.js";
import { hiddenQrPng, readHiddenQrRecord } from "../src/mnemocode-hidden-qr.js";
import {
  MnemoCodeStegoJobs,
  stegoContentBytes,
  type StegoCarrier,
  type StegoOpened,
} from "../src/mnemocode-stego.js";
import {
  stegoBytesText,
  stegoNoticeText,
  stegoPairRefusal,
  stegoProgressLine,
} from "../src/mnemocode-stego-words.js";

// Synthetic carriers written codeword by codeword, public test passwords, public messages and a
// record of the public BIP39 test phrase only.
const PASSWORD = "public test password one";
const DECOY_PASSWORD = "a different decoy phrase 7";
const RECORD = "MNC1:direct:indexes:1 1 1 1 1 1 1 1 1 1 1 4";
const ENCODER = new TextEncoder();

let binding: MnemoCodeBinding;
let jobs: MnemoCodeStegoJobs;
beforeAll(async () => {
  binding = await loadMnemoCode();
  jobs = new MnemoCodeStegoJobs(binding);
});

const carrier = (name = "photo.jpg"): StegoCarrier => ({
  bytes: literalJpeg(512, 512),
  name,
  type: "image/jpeg",
});

async function saved(blob: Blob, name: string): Promise<StegoCarrier> {
  return { bytes: new Uint8Array(await blob.arrayBuffer()), name, type: blob.type };
}

function text(opened: StegoOpened): string {
  if (opened.kind !== "opaque") throw new Error(`Opened ${opened.kind}.`);
  return new TextDecoder().decode(opened.bytes);
}

describe("MnemoCode's steganography in the Deriver's worker", () => {
  it("passes MnemoCode's own startup cases", () => {
    expect(() => binding.stegoSelfCheck(false)).not.toThrow();
  });

  it("reports the guaranteed space at every density, least dense first", () => {
    const stages: string[] = [];
    const analysis = jobs.analyze({ carriers: [carrier()], password: PASSWORD }, ({ stage }) =>
      stages.push(stage),
    );
    using parameters = binding.stegoParameters();
    expect(analysis.rows.map((row) => row.density)).toEqual(parameters.densities);
    const bytes = analysis.rows.map((row) => row.bytes);
    expect(bytes[0]).toBeGreaterThan(0);
    expect(bytes).toEqual([...bytes].sort((a, b) => a - b));
    expect(stages).toContain("deriving-password");
    expect(analysis.notices).toEqual([[]]);
  }, 60_000);

  it("refuses a decoy password too close to the original's before any stretching", () => {
    const analysis = jobs.analyze(
      { carriers: [carrier()], password: PASSWORD, decoyPassword: `${PASSWORD}x` },
      () => undefined,
    );
    expect(analysis.rows).toEqual([]);
    expect(analysis.pair).toMatchObject({
      accepted: false,
      refusalCode: "stego.password.decoy-similar",
    });
    expect(stegoPairRefusal(analysis.pair!, 25)).toMatch(/at least 25% OSA edit difference/u);
  });

  it("writes a message with a decoy; each password opens its own record, a wrong one none", async () => {
    const hidden = await jobs.hide(
      {
        carriers: [carrier()],
        password: PASSWORD,
        contents: { kind: "opaque", bytes: ENCODER.encode("A public test message.") },
        decoy: {
          password: DECOY_PASSWORD,
          contents: { kind: "opaque", bytes: ENCODER.encode("decoy") },
        },
        density: "low",
      },
      () => undefined,
    );
    expect(hidden.files).toHaveLength(1);
    expect(hidden.files[0]).toMatchObject({ name: "photo.jpg", notices: [] });
    const file = await saved(hidden.files[0]!.blob, "photo.jpg");
    expect(text(jobs.open({ carriers: [file], password: PASSWORD }, () => undefined))).toBe(
      "A public test message.",
    );
    expect(text(jobs.open({ carriers: [file], password: DECOY_PASSWORD }, () => undefined))).toBe(
      "decoy",
    );
    expect(
      jobs.open({ carriers: [file], password: "a wrong public password" }, () => undefined),
    ).toEqual({ kind: "no-record", files: [1] });
  }, 120_000);

  it("keeps a backup record compact and gives it back as a record", async () => {
    expect(stegoContentBytes({ kind: "backup", record: RECORD })).toBe(3 + 6 + 7 + 33);
    const hidden = await jobs.hide(
      {
        carriers: [carrier()],
        password: PASSWORD,
        contents: { kind: "backup", record: RECORD },
        density: "minimum",
      },
      () => undefined,
    );
    const file = await saved(hidden.files[0]!.blob, "photo.jpg");
    expect(jobs.open({ carriers: [file], password: PASSWORD }, () => undefined)).toEqual({
      kind: "backup",
      record: RECORD,
    });
  }, 120_000);

  it("divides a message across a set, of which the quorum recovers it", async () => {
    const hidden = await jobs.hide(
      {
        carriers: [carrier("a.jpg"), carrier("b.jpg"), carrier("c.jpg")],
        password: PASSWORD,
        contents: { kind: "opaque", bytes: ENCODER.encode("set message") },
        density: "balanced",
        quorum: 2,
      },
      () => undefined,
    );
    expect(hidden.files).toHaveLength(3);
    const files = await Promise.all(hidden.files.map((file) => saved(file.blob, file.name)));
    expect(
      text(jobs.open({ carriers: [files[0]!, files[2]!], password: PASSWORD }, () => undefined)),
    ).toBe("set message");
    expect(jobs.open({ carriers: [files[1]!], password: PASSWORD }, () => undefined)).toEqual({
      kind: "too-few",
      needed: 2,
      available: 1,
    });
  }, 180_000);

  it("says what each stage and notice is", () => {
    expect(stegoProgressLine({ stage: "deriving-password", file: 2 }, 3)).toBe(
      "File 2 of 3: Stretching the password (Argon2id, 128 MiB)…",
    );
    expect(stegoProgressLine({ stage: "encoding" }, 1)).toBe("Writing the hidden record…");
    expect(stegoBytesText(0)).toBe("not available");
    expect(stegoBytesText(1024)).toBe("1024 bytes (1.000 KiB)");
    expect(stegoNoticeText("jpeg.motion-photo.gap-preserved")).toBe(
      "An existing Motion Photo gap was kept unchanged.",
    );
  });
});

describe("MnemoCode's QR codes with a hidden record", () => {
  it("reads back the exact record behind the visible text", () => {
    const png = hiddenQrPng("Material samples", RECORD);
    expect(readHiddenQrRecord(png)).toBe(RECORD);
  });

  it("reads an ordinary QR as none, so that the page decodes it as any QR", () => {
    const ordinary = binding.qrPng(RECORD);
    expect(readHiddenQrRecord(ordinary)).toBeUndefined();
  });
});
