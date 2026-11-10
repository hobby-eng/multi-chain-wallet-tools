import { describe, expect, it } from "vitest";
import { createBitcoinActivityAdapter } from "../src/activity-bitcoin.js";
import { createEvmActivityAdapter } from "../src/activity-evm.js";
import { evmNetwork } from "@ckd/public-data-providers/evm-networks.js";

// The adapters' services are never called by a self-test.
const unused = {} as never;

describe("the Activity Viewer's address self-tests", () => {
  it("pass for Bitcoin and EVM addresses, the EVM check named alike on every network", () => {
    expect(createBitcoinActivityAdapter(unused).selfTest()).toEqual([
      "Bitcoin BIP173/BIP350 address checksum",
    ]);
    for (const id of ["ethereum", "bnb-chain"])
      expect(createEvmActivityAdapter(evmNetwork(id), unused).selfTest()).toEqual([
        "EVM EIP-55 address checksum",
      ]);
  });
});
