import { describe, expect, it } from "vitest";
import { queryCoreAddress } from "../src/public-address.js";
import { DashScanCoreFixture } from "../../../test/support/dashscan-core-fixture.js";

function query(fixture: DashScanCoreFixture) {
  return queryCoreAddress(DashScanCoreFixture.address, "mainnet", 20, undefined, fixture.fetch);
}

describe("Core transaction amount admission", () => {
  for (const pending of [false, true]) {
    it.each(["bad", undefined, null, "1.5", 1.5, "1".repeat(101), Number.MAX_SAFE_INTEGER + 1, -1])(
      `refuses an invalid matching output %s in ${pending ? "pending" : "confirmed"} history`,
      async (value) => {
        const fixture = new DashScanCoreFixture();
        if (pending) fixture.pending();
        fixture.outputs[0]!.value = value;
        await expect(query(fixture)).rejects.toMatchObject({ code: "core.transaction.amount" });
      },
    );
  }

  it.each(["bad", undefined, null, "0.01", -200])(
    "refuses an invalid matching input %s instead of retaining zero spent",
    async (amount) => {
      const fixture = new DashScanCoreFixture();
      fixture.inputs[0]!.amount = amount;
      await expect(query(fixture)).rejects.toMatchObject({ code: "core.transaction.amount" });
    },
  );

  for (const field of ["vIn", "vOut"]) {
    it.each([undefined, null, {}, "unavailable"])(
      `refuses a missing or malformed ${field} container %s`,
      async (value) => {
        const fixture = new DashScanCoreFixture();
        fixture.transaction[field] = value;
        await expect(query(fixture)).rejects.toMatchObject({ code: "core.transaction.shape" });
      },
    );
  }

  it("preserves an exact zero inflow rather than treating it as unavailable", async () => {
    const fixture = new DashScanCoreFixture();
    fixture.outputs[0]!.value = 0;
    const snapshot = await query(fixture);
    expect(snapshot.transactions[0]).toMatchObject({
      receivedDuffs: 0n,
      spentInputDuffs: 200n,
      netDuffs: -200n,
      feeDuffs: 1100n,
    });
  });

  it("keeps exact flow when a non-matching input has no known amount and the fee is unknown", async () => {
    const fixture = new DashScanCoreFixture();
    delete fixture.inputs[1]!.amount;
    const snapshot = await query(fixture);
    expect(snapshot.transactions[0]).toMatchObject({
      receivedDuffs: 1000n,
      spentInputDuffs: 200n,
      netDuffs: 800n,
      feeDuffs: null,
    });
  });

  it("refuses malformed present amounts even when that input does not match the address", async () => {
    const fixture = new DashScanCoreFixture();
    fixture.inputs[1]!.amount = "private-looking text must not appear in diagnostics";
    await expect(query(fixture)).rejects.toMatchObject({ code: "core.transaction.amount" });
    await expect(query(fixture)).rejects.not.toThrow(/private-looking/u);
  });

  it.each(["unavailable", [DashScanCoreFixture.address, null], ["Xother"]])(
    "refuses malformed or contradictory output address data %s",
    async (addresses) => {
      const fixture = new DashScanCoreFixture();
      fixture.outputs[0]!.addresses = addresses;
      await expect(query(fixture)).rejects.toMatchObject({ code: "core.transaction.shape" });
    },
  );

  it("admits scalar output address metadata when no address list is reported", async () => {
    const fixture = new DashScanCoreFixture();
    delete fixture.outputs[0]!.addresses;
    expect((await query(fixture)).transactions[0]?.receivedDuffs).toBe(1000n);
  });

  it("keeps a coinbase-like empty input set and an unknown fee explicit", async () => {
    const fixture = new DashScanCoreFixture();
    fixture.inputs.length = 0;
    expect((await query(fixture)).transactions[0]).toMatchObject({
      receivedDuffs: 1000n,
      spentInputDuffs: 0n,
      netDuffs: 1000n,
      feeDuffs: null,
    });
  });
});
