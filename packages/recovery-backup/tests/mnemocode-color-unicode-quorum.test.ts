import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@ckd/recovery-sskr-wasm/recovery_sskr_wasm_bg.wasm", () => ({
  default: readFileSync(
    new URL("../../recovery-sskr-wasm/generated/recovery_sskr_wasm_bg.wasm", import.meta.url),
  ),
}));

import { MnemoCodeShares, sskrSharePlatform } from "../src/mnemocode-shares.js";
import { sskrCodec } from "../src/sskr.js";
import { sskrSetVector } from "../../recovery-mnemocode/source/sskr/known-answers.js";
import { writeShare } from "../../recovery-mnemocode/source/sskr/transport.js";
import { BackupReading } from "../../recovery-mnemocode/source/core/backup-reading.js";
import { ShareInput } from "../../recovery-mnemocode/source/sskr/share-input.js";

const one = writeShare(sskrSetVector.shares[0], "colors-unicode");
const three = writeShare(sskrSetVector.shares[2], "colors-unicode");

describe("Color Unicode member one and three through the host", () => {
  it.each(["\n", "\r\n", ";"])(
    "keeps both share boundaries with separator %j",
    async (separator) => {
      const answer = `${one}${separator}${three}`;
      expect(BackupReading.shareKind(answer)).toBe("share");
      expect(ShareInput.partsOfText(answer)).toEqual([one, three]);
      const restore = new MnemoCodeShares(
        sskrSharePlatform(sskrCodec()),
        () => {
          throw new Error("Restore must not generate shares.");
        },
        () => "00000000",
      );
      const result = await restore.restore(
        { answer, mode: "direct", dates: "", confirmed: false },
        () => {},
        new AbortController().signal,
      );
      expect(result).toMatchObject({
        kind: "phrases",
        phrases: [{ mnemonic: sskrSetVector.phrase }],
      });
    },
  );

  it("does not discard unreadable text beside a readable share", () => {
    const answer = `${one}\nunreadable synthetic data`;
    expect(BackupReading.shareKind(answer)).toBe("share");
    expect(ShareInput.partsOfText(answer)).toEqual([one, "unreadable synthetic data"]);
  });
});
