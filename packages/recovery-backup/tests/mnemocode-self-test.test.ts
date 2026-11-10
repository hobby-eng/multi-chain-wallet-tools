import { beforeAll, describe, expect, it } from "vitest";
import { loadMnemoCode } from "../src/mnemocode-module.js";
import { MnemoCodeSelfTestRun } from "../src/mnemocode-self-test.js";
import { runMnemoCodeSelfTest } from "../src/self-test-mnemocode.js";
import { runMnemoCodeCardsSelfTest } from "../src/self-test-mnemocode-cards.js";

beforeAll(async () => {
  await loadMnemoCode();
});

describe("MnemoCode self-tests in the Deriver", () => {
  it("passes MnemoCode's startup cases and the page's round trips", async () => {
    const report = await runMnemoCodeSelfTest();
    expect(report.passed).toBe(true);
    expect(report.checks).toHaveLength(3);
    expect((await runMnemoCodeCardsSelfTest()).passed).toBe(true);
  });

  it("runs every case of the parts this build offers, and the page's own checks after them", async () => {
    const run = new MnemoCodeSelfTestRun();
    const ran: string[] = [];
    run.addCheck({ name: "Page check", detail: "public data", run: () => void ran.push("page") });
    const without = await run.run();
    expect(without.rows.map((row) => row.name)).toEqual([
      "Phrase",
      "Wallet",
      "QR codes",
      "Candidate lists",
      "Recovery",
      "Cross-stitch patterns",
      "Photos and MP3 files",
      "Page check",
    ]);
    expect(ran).toEqual(["page"]);
    run.addShares();
    expect((await run.run()).rows.map((row) => row.name)).toContain("Shamir shares");
  }, 120_000);

  it("stops at the first check that fails", async () => {
    const run = new MnemoCodeSelfTestRun();
    run.addCheck({
      name: "Failing",
      detail: "synthetic",
      run: () => {
        throw new Error("synthetic failure");
      },
    });
    await expect(run.run()).rejects.toThrow("synthetic failure");
  }, 120_000);
});
