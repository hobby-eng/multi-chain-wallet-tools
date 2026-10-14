import { describe, expect, it } from "vitest";
import * as registry from "../src/coins/registry.js";
import * as dashRegistry from "../src/coins/dash-registry.js";
import { createCoinRegistry } from "../src/coins/registry-base.js";
import { runBitcoinPathSelfTest } from "../src/coins/bitcoin/path-self-test.js";
import { runDashPathSelfTest } from "../src/coins/dash/path-self-test.js";
import { runEthereumPathSelfTest } from "../src/coins/ethereum/path-self-test.js";

describe("protocol path startup and full self-test cases", () => {
  it("runs only the admitted coin's known answers and refusals", () => {
    expect(runBitcoinPathSelfTest(registry)).toHaveLength(8);
    expect(runEthereumPathSelfTest(registry)).toHaveLength(3);
    expect(runDashPathSelfTest(registry)).toEqual(runDashPathSelfTest(dashRegistry));
    expect(runBitcoinPathSelfTest(dashRegistry)).toEqual([]);
    expect(runEthereumPathSelfTest(dashRegistry)).toEqual([]);
    const taproot = createCoinRegistry([registry.getCoinAdapter("bitcoin-taproot")]);
    expect(runBitcoinPathSelfTest(taproot)).toEqual([
      "bitcoin-taproot mainnet path metadata",
      "bitcoin-taproot path boundary refusal",
    ]);
  });

  it("fails if an admitted adapter corrupts a known answer or accepts a prohibited range", () => {
    const adapter = registry.getCoinAdapter("bitcoin-taproot");
    expect(() =>
      runBitcoinPathSelfTest(
        createCoinRegistry([{ ...adapter, pathPreview: () => "m/incorrect" }]),
      ),
    ).toThrow(/self-test failed/u);
    expect(() =>
      runBitcoinPathSelfTest(
        createCoinRegistry([{ ...adapter, pathPreview: () => "m/86'/0'/0'/0/0" }]),
      ),
    ).toThrow(/accepted an invalid path/u);
  });
});
