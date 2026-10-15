import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handOverShare,
  takeHandedOverShares,
} from "../src/ui/recovery-mnemocode-share-handover.js";
import { RecoveryTestPage } from "./fake-recovery-page.js";
import { BackupReading } from "../../../packages/recovery-mnemocode/source/core/backup-reading.js";
import { sskrSetVector } from "../../../packages/recovery-mnemocode/source/sskr/known-answers.js";
import { writeShare } from "../../../packages/recovery-mnemocode/source/sskr/transport.js";

describe("Decode transfers the complete multi-share input to Restore", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("retains member one and three plus any unreadable part with their original boundaries", () => {
    new RecoveryTestPage();
    const text = `${writeShare(sskrSetVector.shares[0], "colors-unicode")}\r\n${writeShare(sskrSetVector.shares[2], "colors-unicode")}\r\nunreadable synthetic data`;
    const received: string[] = [];
    takeHandedOverShares((share) => received.push(share.text));
    expect(BackupReading.shareKind(text)).toBe("share");
    expect(handOverShare({ text, fromQr: false })).toBe(true);
    expect(received).toEqual([text]);
  });
});
