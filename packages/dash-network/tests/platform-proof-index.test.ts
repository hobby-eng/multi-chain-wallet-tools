import { describe, expect, it } from "vitest";
import { PlatformProofIndexReconciliation } from "../src/platform-proof-index.js";

describe("Platform proof and index reconciliation", () => {
  const proof = { balanceCredits: 9_007_199_254_740_993n, nonce: 12n, proofHeight: 200n };
  const index = {
    explorerBalanceCredits: 9_007_199_254_740_993n,
    explorerNonce: 12,
    indexedHeight: 190,
  };

  it("allows matching accounting at differing proof and index heights", () => {
    const result = new PlatformProofIndexReconciliation(proof, index);
    expect(result.agrees).toBe(true);
    expect(result.status).toBe("proof_and_index_agree");
  });

  it.each([
    { ...index, explorerBalanceCredits: 9_007_199_254_740_992n },
    { ...index, explorerNonce: 13 },
  ])("keeps proof precedence for either disagreement", (different) => {
    const result = new PlatformProofIndexReconciliation(proof, different);
    expect(result.agrees).toBe(false);
    expect(result.status).toBe("proof_takes_precedence");
    expect(proof.balanceCredits).toBe(9_007_199_254_740_993n);
    expect(proof.nonce).toBe(12n);
  });
});
