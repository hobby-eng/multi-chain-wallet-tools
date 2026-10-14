import { describe, expect, it } from "vitest";
import { DashHistoryBudget } from "../src/history-budget.js";
import { queryCoreAddress } from "../src/public-address.js";
import { queryPlatformAddressHistory } from "../src/platform-address-history.js";
import { queryPlatformIdentityHistory } from "../src/platform-identity-history.js";

describe("shared Dash history budget", () => {
  it("keeps the public limits and default", () => {
    expect(DashHistoryBudget.defaultLimit).toBe(200);
    expect(DashHistoryBudget.admit(1)).toBe(1);
    expect(DashHistoryBudget.admit(1000)).toBe(1000);
  });

  it.each([0, 1001, 1.5, NaN, Infinity])(
    "refuses %s in every public history entry point",
    async (limit) => {
      await expect(
        queryCoreAddress("XoJA8qE3N2Y3jMLEtZ3vcN42qseZ8LvFf5", "mainnet", limit),
      ).rejects.toThrow(/history limit/u);
      await expect(
        queryPlatformAddressHistory(
          "dash1krma5z3ttj75la4m93xcndna9ullamq9y5e9n5rs",
          "mainnet",
          limit,
        ),
      ).rejects.toThrow(/history limit/u);
      await expect(
        queryPlatformIdentityHistory("11111111111111111111111111111111", "mainnet", limit),
      ).rejects.toThrow(/history limit/u);
    },
  );
});
