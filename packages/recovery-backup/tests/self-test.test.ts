import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ckd/recovery-shamir-wasm/recovery_shamir_wasm_bg.wasm', async () => ({
  default: readFileSync(new URL('../../recovery-shamir-wasm/generated/recovery_shamir_wasm_bg.wasm', import.meta.url)),
}));

vi.mock('@ckd/recovery-codex32-wasm/recovery_codex32_wasm_bg.wasm', async () => ({
  default: readFileSync(
    new URL('../../recovery-codex32-wasm/generated/recovery_codex32_wasm_bg.wasm', import.meta.url),
  ),
}));

import { runRecoveryBackupSelfTest } from '../src/self-test.js';

describe('embedded recovery startup self-test', () => {
  it('passes every shipped recovery codec before controls are enabled', () => {
    const report = runRecoveryBackupSelfTest();
    expect(report.passed).toBe(true);
    expect(report.checks).toEqual([
      'SeedQR encode/decode',
      'SLIP-39 official + encode/decode',
      'Shamir raw encode/decode',
      'Shamir words encode/decode',
      'Codex32 official + entropy encode/decode',
    ]);
  });
});
