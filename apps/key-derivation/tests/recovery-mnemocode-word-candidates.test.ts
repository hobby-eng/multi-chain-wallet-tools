import { describe, expect, it, vi } from "vitest";
import { renderMissingWordCandidates } from "../src/ui/recovery-mnemocode-results.js";
import { RecoveryTestPage } from "./fake-recovery-page.js";

// Public BIP39 test phrases only: "about" is word 4 (index 3, bits 00000000011), "art" is word 103
// (index 102), "zoo" word 2048 (index 2047).
const PREFIX = "abandon ".repeat(11);
const LONG = `${"abandon ".repeat(23)}art`;

function table(candidates: Parameters<typeof renderMissingWordCandidates>[1], legacy = false) {
  const page = new RecoveryTestPage();
  const host = page.add("synthetic-result");
  renderMissingWordCandidates(host as unknown as HTMLElement, candidates, vi.fn(), legacy);
  return host.querySelector("textarea.mnemocode-word-options")!.value.split("\n");
}

describe("MnemoCode word candidate tables", () => {
  it("shows the checksum bits that end each candidate's last word", () => {
    const rows = table([
      { position: 12, word: "about", wordIndex: 4, mnemonic: `${PREFIX}about` },
      { position: 24, word: "art", wordIndex: 103, mnemonic: LONG },
    ]);
    expect(rows[0]).toBe("candidate\tword\tword-index\tchecksum-bits");
    // Twelve words carry four checksum bits, twenty-four carry eight.
    expect(rows[1]).toBe("1\tabout\t4\t0011");
    expect(rows[2]).toBe("2\tart\t103\t01100110");
  });

  it("adds the legacy tail after the checksum bits for an old last word", () => {
    const rows = table(
      [
        {
          position: 12,
          word: "zoo",
          wordIndex: 2048,
          mnemonic: `${PREFIX}zoo`,
          preservesLegacyEntropy: true,
        },
      ],
      true,
    );
    expect(rows[0]).toBe("candidate\tword\tword-index\tchecksum-bits\tlegacy-tail");
    expect(rows[1]).toBe("1\tzoo\t2048\t1111\tpreserved");
  });
});
