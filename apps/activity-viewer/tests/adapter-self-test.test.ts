import { describe, expect, it } from "vitest";
import { createBitcoinActivityAdapter } from "../src/activity-bitcoin.js";
import { createEthereumActivityAdapter } from "../src/activity-ethereum.js";

// The adapters' services are never called by a self-test.
const unused = {} as never;

describe("the Activity Viewer's address self-tests", () => {
  it("pass for Bitcoin and Ethereum addresses", () => {
    expect(createBitcoinActivityAdapter(unused).selfTest()).toEqual([
      "Bitcoin BIP173/BIP350 address checksum",
    ]);
    expect(createEthereumActivityAdapter(unused).selfTest()).toEqual([
      "Ethereum EIP-55 address checksum",
    ]);
  });
});
