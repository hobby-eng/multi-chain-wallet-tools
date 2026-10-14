import type { ShieldedActivity } from "@ckd/dash-network/types.js";
import { describe, expect, it } from "vitest";
import { shouldDisplayShieldedActivity } from "../src/coins/dash/shielded-filter.js";
import { shieldedFindingPresentation } from "../src/coins/dash/shielded-presentation.js";

describe("Orchard viewing-key presentation", () => {
  const note = {
    value: 1n,
    addressRaw: "00",
    address: "dash1ztest",
    memoHex: "",
    memo: "",
    noteNullifier: "11",
  };
  const base = { position: 1n, cmx: "22", actionNullifier: "33" };

  it("shows an IVK note by default without claiming it is unspent", () => {
    const unknown = { ...base, direction: "received", incoming: note } satisfies ShieldedActivity;

    expect(shouldDisplayShieldedActivity(unknown, false)).toBe(true);
    expect(shieldedFindingPresentation(unknown, true)).toEqual({
      balanceAtomic: null,
      balanceLabel: "Current balance unavailable · spend state unknown",
      spendState: "Unknown · FVK required",
    });
  });

  it("distinguishes authoritative FVK state from outgoing-only activity", () => {
    const spendable = {
      ...base,
      direction: "received",
      incoming: note,
      spent: false,
    } satisfies ShieldedActivity;
    const outgoing = {
      ...base,
      position: 2n,
      direction: "sent",
      outgoing: note,
    } satisfies ShieldedActivity;

    expect(shieldedFindingPresentation(spendable, true)).toEqual({
      balanceAtomic: 1n,
      balanceLabel: "0.00000000001 DASH",
      spendState: "Unspent",
    });
    expect(shieldedFindingPresentation(outgoing, true)).toEqual({
      balanceAtomic: null,
      balanceLabel: "Current balance unavailable · outgoing view only",
      spendState: "Outgoing view only",
    });
  });

  it.each([
    ["full", true, 1n, "Unspent"],
    ["full", false, null, "Unknown · scan incomplete"],
    ["incoming", true, null, "Unknown · FVK required"],
    ["incoming", false, null, "Unknown · FVK required"],
    ["outgoing", true, null, "Unknown · FVK required"],
    ["outgoing", false, null, "Unknown · FVK required"],
  ] as const)(
    "uses shared spend-state admission for %s viewing keys with complete=%s",
    (keyKind, complete, balanceAtomic, spendState) => {
      const provisional = {
        ...base,
        direction: "received",
        incoming: note,
        spent: false,
      } satisfies ShieldedActivity;
      expect(shieldedFindingPresentation(provisional, complete, keyKind)).toMatchObject({
        balanceAtomic,
        spendState,
      });
      // Unknown notes remain visible; showing a note must not imply a spendable balance.
      expect(shouldDisplayShieldedActivity(provisional, false, complete, keyKind)).toBe(true);
    },
  );

  it.each(["full", "incoming", "outgoing"] as const)(
    "keeps an observed spend known for an incomplete %s scan",
    (keyKind) => {
      const spent = {
        ...base,
        direction: "received",
        incoming: note,
        spent: true,
      } satisfies ShieldedActivity;
      expect(shieldedFindingPresentation(spent, false, keyKind)).toEqual({
        balanceAtomic: 0n,
        balanceLabel: "0 DASH · already spent",
        spendState: "Spent",
      });
      expect(shouldDisplayShieldedActivity(spent, false, false, keyKind)).toBe(false);
      expect(shouldDisplayShieldedActivity(spent, true, false, keyKind)).toBe(true);
    },
  );
});
