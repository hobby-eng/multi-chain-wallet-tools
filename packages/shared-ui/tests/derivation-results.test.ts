import { describe, expect, it } from "vitest";
import type { DerivationResult } from "@ckd/core/types.js";
import { DerivationResults, DerivationResultsError } from "../src/derivation-results.js";
import { DerivationResultFixture } from "@ckd/test-support/derivation-result.js";

it("retires the healthy branch before reporting another branch's native snapshot failure", () => {
  const owner = new DerivationResults();
  const broken = DerivationResultFixture.create();
  const healthy = DerivationResultFixture.create();
  const held = healthy.rows[0]!.advanced[0]!;
  owner.accept("receive", broken);
  owner.accept("change", healthy);
  DerivationResultFixture.refuseGroupsRead(broken);
  expect(() => owner.wipe()).toThrow(
    expect.objectContaining({
      code: "derivation.result.property",
      message: "derivation.result.property",
    }),
  );
  expect(owner.size).toBe(0);
  expect(held.value).toBe("");
  expect(() => {
    held.value = "synthetic late private";
  }).toThrow(expect.objectContaining({ code: "derivation.result.retired" }));
});

it("retires other branches and selection even when one result refuses native cleanup", () => {
  const owner = new DerivationResults();
  const first = DerivationResultFixture.create();
  const second = DerivationResultFixture.create();
  DerivationResultFixture.refusePublicWrite(first, "readonly");
  owner.accept("receive", first);
  owner.accept("change", second);
  const fields = [first.rows[0]!.advanced[0]!, second.rows[0]!.advanced[0]!];
  expect(() => owner.wipe()).toThrow(
    expect.objectContaining({ code: "derivation.result.property" }),
  );
  expect(fields.every((field) => field.value === "")).toBe(true);
  expect(owner.current).toBeNull();
  expect(owner.size).toBe(0);
  expect(owner.selected.size).toBe(0);
});

it("retires an incoming replacement too when the previous result cannot be released normally", () => {
  const owner = new DerivationResults();
  const first = DerivationResultFixture.create();
  const second = DerivationResultFixture.create();
  DerivationResultFixture.refusePublicWrite(first, "readonly");
  owner.accept("receive", first);
  const fields = [first.rows[0]!.advanced[0]!, second.rows[0]!.advanced[0]!];
  expect(() => owner.accept("receive", second)).toThrow(
    expect.objectContaining({ code: "derivation.result.property" }),
  );
  expect(fields.every((field) => field.value === "")).toBe(true);
  expect(owner.current).toBeNull();
});

function result(): DerivationResult {
  return {
    id: "synthetic",
    title: "Synthetic result",
    networkLabel: "Test",
    pathTemplate: "m/i",
    basicSummary: [],
    summary: [],
    notices: [],
    rows: [0, 1].map((index) => ({
      index,
      path: `m/${index}`,
      title: "Synthetic row",
      basic: [],
      advanced: [
        { key: "private", label: "Synthetic test material", value: "synthetic", secret: true },
      ],
    })),
  };
}

describe("derivation result ownership", () => {
  it.each(["wipe", "replace"])(
    "retires an incoming branch refused during reentrant %s",
    (operation) => {
      const owner = new DerivationResults();
      const previous = result();
      const incoming = result();
      const held = incoming.rows[0]!.advanced[0]!;
      const statuses: string[] = [];
      previous.basicSummary.push({
        key: "public",
        label: "Public",
        secret: false,
        value: "synthetic",
      });
      Object.defineProperty(previous.basicSummary[0]!, "value", {
        set: () => {
          try {
            owner.accept("change", incoming);
            statuses.push("accepted");
          } catch (cause) {
            statuses.push(cause instanceof DerivationResultsError ? cause.code : "unexpected");
          }
        },
      });
      owner.accept("receive", previous);
      if (operation === "wipe") owner.wipe();
      else owner.accept("receive", result());
      expect(statuses).toEqual(["derivation.results.mutating"]);
      expect(held.value).toBe("");
      expect(() => {
        held.value = "synthetic late private";
      }).toThrow(expect.objectContaining({ code: "derivation.result.retired" }));
      expect(owner.states.has("change")).toBe(false);
      owner.wipe();
    },
  );
  it("retains independent branch selection, pages and CoinJoin preference", () => {
    const owner = new DerivationResults();
    owner.accept("receive", result());
    owner.accept("coinjoin-internal", result());
    owner.activate("receive");
    owner.select(0, false);
    owner.moveWindow(200);
    owner.activate("coinjoin-internal");
    expect([...owner.selected]).toEqual([0, 1]);
    expect(owner.windowStart).toBe(0);
    expect(owner.coinJoinBranch).toBe("coinjoin-internal");
    owner.activate("receive");
    expect([...owner.selected]).toEqual([1]);
    expect(owner.windowStart).toBe(200);
    expect(owner.generated).toBe(4);
    owner.wipe();
  });

  it("selects known rows and resets the page when the display mode changes", () => {
    const owner = new DerivationResults();
    owner.accept("receive", result());
    owner.selectRows("none");
    expect(owner.selected.size).toBe(0);
    owner.select(1, true);
    owner.selectRows("invert");
    expect([...owner.selected]).toEqual([0]);
    owner.selectRows("all");
    expect([...owner.selected]).toEqual([0, 1]);
    owner.moveWindow(200);
    owner.setMode("advanced");
    expect(owner.windowStart).toBe(0);
    expect(owner.mode).toBe("advanced");
    owner.wipe();
  });

  it("wipes retained containers on disposal and on branch replacement", () => {
    const owner = new DerivationResults();
    const old = result();
    const oldField = old.rows[0]?.advanced[0];
    owner.accept("receive", old);
    const fresh = result();
    fresh.accountDescriptors = {
      accountPath: "m/0'",
      publicText: "synthetic public descriptor",
      privateText: "synthetic private descriptor",
      scannerText: "synthetic scanner descriptor",
      fileStem: "synthetic",
    };
    const descriptors = fresh.accountDescriptors;
    const freshField = fresh.rows[0]?.advanced[0];
    owner.accept("receive", fresh);
    expect(old.rows).toEqual([]);
    expect(oldField?.value).toBe("");
    expect(freshField?.value).toBe("synthetic");
    owner[Symbol.dispose]();
    expect(fresh.rows).toEqual([]);
    expect(freshField?.value).toBe("");
    expect(descriptors.privateText).toBe("");
    expect(descriptors.publicText).toBe("");
    expect(descriptors.scannerText).toBe("");
    expect(owner.current).toBeNull();
    expect(owner.size).toBe(0);
    expect(owner.selected.size).toBe(0);
  });

  it("refuses an appended batch after its branch owner was discarded", () => {
    const owner = new DerivationResults();
    expect(() => owner.appendSelection("receive", [{ index: 0 }])).toThrow(
      expect.objectContaining({ code: "derivation.results.branch-missing" }),
    );
    expect(owner.activate("change")).toBe(false);
  });

  it.each(["wipe", "replacement"])("refuses resurrecting a private field after %s", (ending) => {
    const owner = new DerivationResults();
    const previous = result();
    owner.accept("receive", previous);
    const field = previous.rows[0]!.advanced[0]!;
    if (ending === "wipe") owner.wipe();
    else owner.accept("receive", result());
    expect(field.value).toBe("");
    expect(() => {
      field.value = "synthetic late private value";
    }).toThrow(expect.objectContaining({ code: "derivation.result.retired" }));
    expect(field.value).toBe("");
    owner.wipe();
  });
});
