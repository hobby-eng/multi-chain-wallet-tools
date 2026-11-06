import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mnemocode } from "@ckd/recovery-backup/mnemocode-engine.js";
import { loadMnemoCode } from "@ckd/recovery-backup/mnemocode-module.js";
import { splitShares } from "@ckd/recovery-backup/mnemocode-shares.js";
import {
  handOverShare,
  takeHandedOverShares,
} from "../src/ui/recovery-mnemocode-share-handover.js";
import { RecoveryTestPage } from "./fake-recovery-page.js";

// The public BIP39 test phrase, split 2 of 3.
const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

beforeAll(async () => {
  await loadMnemoCode();
});

describe("Decode transfers the complete multi-share input to Restore", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("retains member one and three plus any unreadable part with their original boundaries", () => {
    new RecoveryTestPage();
    const { records } = splitShares({
      phrase: PHRASE,
      mode: "direct",
      dates: undefined,
      threshold: 2,
      count: 3,
      form: "colors-unicode",
    });
    const write = (record: string): string => mnemocode().writeShare(record, "colors-unicode");
    const text = `${write(records[0]!)}\r\n${write(records[2]!)}\r\nunreadable synthetic data`;
    const received: string[] = [];
    takeHandedOverShares((share) => received.push(share.text));
    expect(mnemocode().shareKind(text)).toBe("share");
    expect(handOverShare({ text, fromQr: false })).toBe(true);
    expect(received).toEqual([text]);
  });
});
