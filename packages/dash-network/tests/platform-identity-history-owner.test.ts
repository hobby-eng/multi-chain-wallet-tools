import { describe, expect, it } from "vitest";
import {
  PlatformIdentityHistory,
  queryPlatformIdentityHistory,
} from "../src/platform-identity-history.js";
import { PlatformIdentifier } from "../src/platform-identifier.js";
import { PlatformIdentityHistoryFixture } from "../../../test/support/platform-identity-history-fixture.js";

describe("Platform indexed history request ownership", () => {
  it("keeps request counts per owner and refuses a repeated query before HTTP", async () => {
    const fixture = new PlatformIdentityHistoryFixture();
    const owner = new PlatformIdentityHistory(
      fixture.identifier,
      "mainnet",
      1,
      undefined,
      fixture.fetch,
    );
    const result = await owner.read();
    expect(result).toMatchObject({
      identifier: fixture.identifier,
      requests: 8,
      historyWarnings: [],
    });
    await expect(owner.read()).rejects.toMatchObject({ code: "identity.history.used" });
    expect(fixture.urls).toHaveLength(8);
  });

  it("uses the same canonical-byte refusal before HTTP in the compatibility API", async () => {
    const fixture = new PlatformIdentityHistoryFixture();
    await expect(
      queryPlatformIdentityHistory("1".repeat(44), "mainnet", 1, undefined, fixture.fetch),
    ).rejects.toMatchObject({ code: "platform.identifier.invalid" });
    expect(fixture.urls).toHaveLength(0);
  });

  it("classifies formats without treating every string as an accepted identifier", () => {
    for (const value of ["1".repeat(32), "1".repeat(31) + "2"]) {
      expect(PlatformIdentifier.is(value)).toBe(true);
      expect(() => PlatformIdentifier.require(value)).not.toThrow();
    }
    for (const value of ["1".repeat(44), "not a public identifier", "1".repeat(100_000), null]) {
      expect(PlatformIdentifier.is(value)).toBe(false);
      expect(() => PlatformIdentifier.require(value)).toThrow(
        expect.objectContaining({ code: "platform.identifier.invalid" }),
      );
    }
  });

  it("refuses a mismatched provider resource before requesting its collections", async () => {
    const fixture = new PlatformIdentityHistoryFixture();
    fixture.info.identifier = "different provider-controlled text";
    await expect(
      queryPlatformIdentityHistory(fixture.identifier, "mainnet", 1, undefined, fixture.fetch),
    ).rejects.toMatchObject({ code: "identity.history.resource" });
    expect(fixture.urls).toHaveLength(2);
  });
});
