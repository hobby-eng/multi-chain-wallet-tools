import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@ckd/recovery-sskr-wasm/recovery_sskr_wasm_bg.wasm", () => ({
  default: readFileSync(
    new URL("../../recovery-sskr-wasm/generated/recovery_sskr_wasm_bg.wasm", import.meta.url),
  ),
}));

import { sskrCodec } from "../src/sskr.js";
import { SskrGroupPolicy } from "../src/sskr-groups.js";

describe("SSKR host admission and borrowed buffers", () => {
  it("refuses an unknown selector without exposing or coercing it", () => {
    const selector = "synthetic-private-selector";
    try {
      sskrCodec().create(
        new Uint8Array(16),
        1,
        [{ threshold: 1, count: 1 }],
        new Uint8Array(32),
        selector as never,
      );
      throw new Error("Expected a refusal.");
    } catch (cause) {
      expect(cause).toBeInstanceOf(Error);
      if (!(cause instanceof Error)) throw cause;
      expect(cause.message).not.toContain(selector);
      expect(cause).toHaveProperty("code", "sskr.codec.unsupported-encoding");
    }
    const toString = vi.fn(() => selector);
    expect(() => sskrCodec().recover([], { toString } as never)).toThrow(
      "Unsupported SSKR share encoding.",
    );
    expect(toString).not.toHaveBeenCalled();
  });

  it("takes each member count and threshold from one validated snapshot", () => {
    let reads = 0;
    const group = {
      get threshold() {
        return ++reads === 1 ? 2 : 258;
      },
      count: 3,
    };
    const policy = new SskrGroupPolicy(1, [group]);
    expect(policy.pack()).toEqual(Uint8Array.of(2, 3));
    expect(reads).toBe(1);
  });

  it.each([258, 259, 1.5, -1, NaN])(
    "refuses a member count of %s before byte narrowing",
    (count) => {
      expect(() => new SskrGroupPolicy(1, [{ threshold: 2, count }])).toThrow();
    },
  );

  it("preserves the caller's secret and randomness on an engine refusal", () => {
    const secret = Uint8Array.of(1, 2, 3);
    const seed = new Uint8Array(32).fill(7);
    expect(() => sskrCodec().create(secret, 1, [{ threshold: 2, count: 3 }], seed)).toThrow();
    expect(secret).toEqual(Uint8Array.of(1, 2, 3));
    expect(seed).toEqual(new Uint8Array(32).fill(7));
  });

  it("preserves the Rust refusal kind and stable code", () => {
    let refusal: unknown;
    try {
      sskrCodec().recover([]);
    } catch (cause) {
      refusal = cause;
    }
    expect(refusal).toBeInstanceOf(Error);
    expect(refusal).toHaveProperty("code", "sskr.engine.no-shares");
  });
});
