import { vi } from "vitest";
import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { Slip39 } from "../../packages/recovery-backup/src/slip39.js";

/** Metadata fixtures refuse to run unless their caller already replaced the KDF. */
export class PassiveSlip39 {
  /** Generates real share framing/checksum with passive stretching, including exponent15. */
  static share(exponent: number, bytes = 16): string {
    if (!vi.isMockFunction(pbkdf2)) throw new Error("Metadata fixtures forbid a real SLIP-39 KDF.");
    const groups = Slip39.create(new Uint8Array(bytes).fill(7), {
      groupThreshold: 1,
      groups: [{ memberThreshold: 1, memberCount: 1 }],
      iterationExponent: exponent,
      randomBytes: (length) => new Uint8Array(length).fill(4),
    });
    vi.mocked(pbkdf2).mockClear();
    const share = groups[0]?.[0];
    if (share === undefined) throw new Error("The passive share fixture was not created.");
    return share;
  }
}
