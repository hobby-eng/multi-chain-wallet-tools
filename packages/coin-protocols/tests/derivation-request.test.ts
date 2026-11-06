import { describe, expect, it } from "vitest";
import { DerivationBranches } from "../src/coins/derivation-branches.js";
import { DerivationConsent, DerivationRequest } from "../src/coins/derivation-request.js";
import type { DerivationParameters } from "../src/coins/derivation-request.js";

const ADAPTER = {
  id: "synthetic",
  batchSize: 50,
  addressBranches: { receive: 0, change: 1 },
};
const INPUT = {
  network: "mainnet",
  account: 0,
  branch: 0,
  start: 0,
  count: 5000,
  includeChange: true,
  includeCoinJoin: false,
} as const;

describe("derivation request planning", () => {
  it("counts all branch batches and captures public request settings", () => {
    const input: DerivationParameters = { ...INPUT };
    const request = new DerivationRequest(ADAPTER, input, null);
    input.count = 1;
    expect(request.total).toBe(10000);
    expect(request.batches).toBe(200);
    expect(request.memoryMiB).toEqual([40, 118]);
    expect(request.needsConfirmation).toBe(true);
    expect(request.branches).toEqual([
      { kind: "receive", branch: 0 },
      { kind: "change", branch: 1 },
    ]);
  });

  it("snapshots branch metadata and protects the captured plan from mutation", () => {
    const adapter = { addressBranches: { receive: 0, change: 1 } };
    const branches = new DerivationBranches(adapter, 0, true);
    adapter.addressBranches.receive = 7;
    expect(branches.plans[0]).toEqual({ kind: "receive", branch: 0 });
    expect(Object.isFrozen(branches.plans)).toBe(true);
    expect(Reflect.set(branches.plans[0] ?? {}, "branch", 9)).toBe(false);
  });

  it("keeps the selected branch where the protocol offers no change pair", () => {
    expect(new DerivationBranches({}, 7, true).plans).toEqual([{ kind: "receive", branch: 7 }]);
  });
});

describe("large derivation consent", () => {
  it("admits a small automatic range and pauses at the exact total-row threshold", () => {
    const consent = new DerivationConsent();
    expect(
      consent.consider(new DerivationRequest(ADAPTER, { ...INPUT, count: 4999 }, null), true),
    ).toBe("ready");
    const large = new DerivationRequest(ADAPTER, INPUT, null);
    expect(consent.consider(large, true)).toBe("skipped");
    expect(consent.consider(large, false)).toBe("confirm");
    expect(consent.consider(large, false)).toBe("ready");
    expect(consent.consider(large, false)).toBe("confirm");
  });

  it("requires fresh consent after edits, an automatic attempt or Clear", () => {
    const consent = new DerivationConsent();
    const first = new DerivationRequest(ADAPTER, INPUT, null);
    const edited = new DerivationRequest(ADAPTER, { ...INPUT, account: 1 }, null);
    expect(consent.consider(first, false)).toBe("confirm");
    expect(consent.consider(edited, false)).toBe("confirm");
    expect(consent.consider(edited, true)).toBe("skipped");
    expect(consent.consider(edited, false)).toBe("confirm");
    consent.clear();
    expect(consent.consider(edited, false)).toBe("confirm");
  });
});
