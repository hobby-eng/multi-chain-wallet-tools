import { afterEach, describe, expect, it, vi } from "vitest";
import * as chosenWords from "@ckd/core/bip39-chosen-words.js";
import * as coreCrypto from "@ckd/core/crypto.js";
import { runBip39SelfTest } from "../src/bip39-self-test.js";

describe("BIP39 chosen-word startup checks", () => {
  afterEach(() => vi.restoreAllMocks());

  it("runs the exact KAT with five-length geometry and predicate checks without host randomness", () => {
    const random = vi.spyOn(crypto, "getRandomValues").mockImplementation(() => {
      throw new Error("The deterministic component must not request host randomness.");
    });
    const report = runBip39SelfTest();
    expect(report.passed).toBe(true);
    expect(report.checks).toEqual([
      "BIP39",
      "BIP39 chosen words",
      "BIP39 chosen-word bit placement and readback (five lengths)",
      "BIP39 chosen-word checksum, predicates and refusals (five lengths)",
    ]);
    expect(random).not.toHaveBeenCalled();
  });

  it("fails when a real checksum implementation produces another public zero-entropy answer", () => {
    vi.spyOn(coreCrypto, "sha256").mockImplementation(() => new Uint8Array(32));
    expect(runBip39SelfTest).toThrow(
      "BIP39 chosen-word self-test failed: public zero-entropy word indexes and checksum.",
    );
  });

  it("propagates a feature-owned check failure instead of reporting success", () => {
    vi.spyOn(chosenWords, "runChosenWordsSelfTest").mockImplementation(() => {
      throw new Error("Controlled chosen-word bit check failure.");
    });
    expect(runBip39SelfTest).toThrow("Controlled chosen-word bit check failure.");
  });
});
