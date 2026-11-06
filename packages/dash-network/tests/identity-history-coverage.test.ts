import { describe, expect, it } from "vitest";
import { IdentityHistoryCoverage } from "../src/identity-history-coverage.js";
import { queryPlatformIdentityHistory } from "../src/platform-identity-history.js";
import { PlatformIdentityHistoryFixture } from "../../../test/support/platform-identity-history-fixture.js";

async function completeResult() {
  const fixture = new PlatformIdentityHistoryFixture();
  return {
    identifier: fixture.identifier,
    history: await queryPlatformIdentityHistory(
      fixture.identifier,
      "mainnet",
      1,
      undefined,
      fixture.fetch,
    ),
    error: null,
  };
}

describe("Identity auxiliary coverage", () => {
  it("distinguishes unavailable, unreported and warning-free history", async () => {
    const result = await completeResult();
    expect(new IdentityHistoryCoverage(result).status).toBe("no-warnings-reported");
    expect(new IdentityHistoryCoverage(result).warnings).toEqual([]);
    delete result.history.historyWarnings;
    expect(new IdentityHistoryCoverage(result).status).toBe("unreported");
    expect(new IdentityHistoryCoverage(result).warnings).toBeNull();
    expect(new IdentityHistoryCoverage(undefined).status).toBe("unavailable");
    expect(
      new IdentityHistoryCoverage({ ...result, history: null, error: "Lookup failed." }).warnings,
    ).toBeNull();
  });

  it("owns its warnings rather than letting caller mutation change coverage", async () => {
    const result = await completeResult();
    result.history.historyWarnings = ["Synthetic collection limit."];
    const coverage = new IdentityHistoryCoverage(result);
    result.history.historyWarnings.length = 0;
    const returned = coverage.warnings;
    if (returned !== null) Reflect.apply(Array.prototype.pop, returned, []);
    expect(coverage.status).toBe("limited-or-unverified");
    expect(coverage.warnings).toEqual(["Synthetic collection limit."]);
  });

  it("summarizes every expected Identity, retaining warnings even if a neighbor is unavailable", async () => {
    const result = await completeResult();
    result.history.historyWarnings = ["Collection total unknown."];
    expect(IdentityHistoryCoverage.summarize([result.identifier, "missing"], [result])).toEqual({
      status: "unavailable",
      warnings: `${result.identifier}: Collection total unknown.`,
    });
  });
});
