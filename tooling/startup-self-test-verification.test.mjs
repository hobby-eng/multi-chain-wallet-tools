import { describe, expect, it } from "vitest";
import { SelfTestInventory } from "./self-test-inventory.mjs";
import { StartupSelfTestCatalog } from "./startup-self-test-catalog.mjs";

const EXPECTED = ["first", "first", "last"];
const definition = {
  entry: "unused-synthetic-entry.ts",
  run: "unused",
  expectedChecks: EXPECTED,
  label: "synthetic startup report",
};
const reportOf = (checks) => ({ passed: true, checks, durationMs: 0 });

describe("startup report admission", () => {
  it("accepts each expected case once, preserving an intentionally repeated public label", () => {
    expect(new SelfTestInventory(definition).check(reportOf(["last", "first", "first"]))).toEqual({
      passed: true,
      checks: ["last", "first", "first"],
      durationMs: 0,
    });
  });

  it.each(
    [
      [],
      ["first", "last"],
      ["first", "first", "last", "extra"],
      ["first", "last", "last"],
      ["first", "first", "renamed"],
    ].map((checks) => ({ checks })),
  )("refuses a missing, added, substituted or renamed check: %j", ({ checks }) => {
    expect(() => new SelfTestInventory(definition).check(reportOf(checks))).toThrow(
      expect.objectContaining({ code: "self-test.report.inventory" }),
    );
  });

  it.each([
    null,
    {},
    { ...reportOf(EXPECTED), passed: false },
    { ...reportOf(EXPECTED), checks: "first" },
    reportOf(["first", undefined, "last"]),
    // oxlint-disable-next-line unicorn/no-new-array -- Deliberate sparse input must differ from a dense list of undefined values.
    reportOf(new Array(3)),
    { ...reportOf(EXPECTED), durationMs: NaN },
    { ...reportOf(EXPECTED), durationMs: -1 },
  ])("refuses an incomplete or malformed report: %j", (report) => {
    expect(() => new SelfTestInventory(definition).check(report)).toThrow(
      expect.objectContaining({ code: "self-test.report.incomplete" }),
    );
  });
});

describe("independent startup inventories", () => {
  it("keeps the complete 137-case Multi-Chain and 39-case Dash worker inventories", () => {
    expect(StartupSelfTestCatalog.multiChain.expectedChecks).toHaveLength(137);
    expect(StartupSelfTestCatalog.dashCommunity.expectedChecks).toHaveLength(39);
    for (const catalog of [StartupSelfTestCatalog.multiChain, StartupSelfTestCatalog.dashCommunity])
      expect(
        catalog.expectedChecks.filter(
          (check) => check === "dash-core-coinjoin path boundary refusal",
        ),
      ).toHaveLength(2);
    expect(
      StartupSelfTestCatalog.dashCommunity.expectedChecks.some((check) =>
        /bitcoin|ethereum|bip39/iu.test(check),
      ),
    ).toBe(false);
  });

  it("refuses omission of every individual case, including either repeated Dash refusal", () => {
    // Synthetic reports exercise inventory admission only; the two CLIs execute real cryptography.
    for (const catalog of [
      StartupSelfTestCatalog.multiChain,
      StartupSelfTestCatalog.dashCommunity,
    ]) {
      const verifier = new SelfTestInventory(catalog);
      for (let index = 0; index < catalog.expectedChecks.length; index += 1) {
        const checks = catalog.expectedChecks.filter((_, position) => position !== index);
        expect(() => verifier.check(reportOf(checks))).toThrow(
          expect.objectContaining({ code: "self-test.report.inventory" }),
        );
      }
    }
  });
});
