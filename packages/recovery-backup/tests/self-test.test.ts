import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@ckd/recovery-codex32-wasm/recovery_codex32_wasm_bg.wasm", async () => ({
  default: readFileSync(
    new URL("../../recovery-codex32-wasm/generated/recovery_codex32_wasm_bg.wasm", import.meta.url),
  ),
}));

vi.mock("@ckd/recovery-sskr-wasm/recovery_sskr_wasm_bg.wasm", async () => ({
  default: readFileSync(
    new URL("../../recovery-sskr-wasm/generated/recovery_sskr_wasm_bg.wasm", import.meta.url),
  ),
}));

vi.mock("@ckd/recovery-envelope-wasm/recovery_envelope_wasm_bg.wasm", async () => ({
  default: readFileSync(
    new URL(
      "../../recovery-envelope-wasm/generated/recovery_envelope_wasm_bg.wasm",
      import.meta.url,
    ),
  ),
}));

import { runRecoveryBackupSelfTest } from "../src/self-test.js";

describe("embedded recovery startup self-test", () => {
  it("passes every shipped recovery codec before controls are enabled", async () => {
    const report = await runRecoveryBackupSelfTest();
    expect(report.passed).toBe(true);
    expect(report.checks).toEqual([
      "SeedQR encode/decode",
      expect.stringMatching(
        /^MnemoCode v\d+\.\d+\.\d+ WebAssembly: phrase, wallet, QR, candidate, share, recovery, cross-stitch and steganography known answers$/u,
      ),
      "MnemoCode encode and decode round trips in every form",
      "MnemoCode SeedStitch: the specification's legend read back",
      "MnemoCode card, heir sheet and share card known answers",
      "SLIP-39 official + encode/decode",
      "Codex32 official + entropy encode/decode",
      "SSKR BCR-2020-011 grouped vector",
      "SSKR Compact UR encode/decode",
      "SSKR Bytewords encode/decode",
      "Gordian Seed Envelope encrypted entropy/passphrase encode/decode",
    ]);
  });
});
