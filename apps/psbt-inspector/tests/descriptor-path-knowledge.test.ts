import { describe, expect, it } from "vitest";
import { decodeDescriptor } from "../src/descriptor.js";

// Published Bitcoin Core TESTMODE_VALID Miniscript vector (official-vectors.json entries 83/96).
const KEY = "03d30199d74fb5a22d47b6e054e2f378cedacffcb89904a61d75d0dbd407143e65";
describe("descriptor path cards preserve the limits of their knowledge", () => {
  it.each([1, 2, 3])(
    "keeps threshold %i conditions symbolic rather than conjoining every lock",
    (required) => {
      const value = decodeDescriptor(
        `wsh(thresh(${required},c:pk_k(${KEY}),altv:after(1000000000),altv:after(100)))`,
      );
      expect(value.pathCards).toHaveLength(1);
      expect(value.pathCards[0]).toMatchObject({
        availability: "Not summarized; review the symbolic policy",
        keys: null,
        locks: null,
        preimages: null,
      });
      expect(value.pathCards[0]?.requirement).toContain(`${required} of`);
      expect(value.pathCards[0]?.availability).not.toContain(" and ");
    },
  );
  it.each(["raw(51)", "addr(1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa)"])(
    "does not infer spending obligations from an opaque output: %s",
    (text) => {
      expect(decodeDescriptor(text).pathCards[0]).toMatchObject({
        availability: "Not summarized; review the symbolic policy",
        keys: null,
        locks: null,
        preimages: null,
      });
    },
  );
  it("preserves a known conjunctive lock and a known empty preimage set", () => {
    const value = decodeDescriptor(`wsh(and_v(v:pk(${KEY}),older(144)))`);
    expect(value.pathCards[0]).toMatchObject({
      availability: "After relative 144 = 144 blocks",
      preimages: [],
    });
    expect(value.pathCards[0]?.locks).toEqual(["relative 144 = 144 blocks"]);
  });
  it("does not label a constant-false policy immediately spendable", () => {
    expect(decodeDescriptor("wsh(0)").pathCards[0]).toMatchObject({
      availability: "No satisfying path",
      keys: [],
      locks: [],
      preimages: [],
    });
  });
  it("explains that a Miniscript threshold needs exact satisfaction and other dissatisfactions", () => {
    const value = decodeDescriptor(`wsh(thresh(1,c:pk_k(${KEY}),altv:after(100)))`);
    expect(value.pathCards[0]?.requirement).toContain("exactly 1 of");
    expect(value.pathCards[0]?.requirement).toContain("dissatisfaction witnesses");
  });
  it.each([`wpkh(${KEY})`, `rawtr(${KEY.slice(2)})`])(
    "keeps the key obligation of a direct output descriptor: %s",
    (text) => {
      const card = decodeDescriptor(text).pathCards[0];
      expect(card?.keys).toHaveLength(1);
      expect(card?.requirement).toContain("one signature");
    },
  );
  it("does not flatten Taproot key and script alternatives into one empty obligation list", () => {
    const card = decodeDescriptor(`tr(${KEY.slice(2)},older(144))`).pathCards[0];
    expect(card).toMatchObject({
      availability: "Not summarized; review the symbolic policy",
      keys: null,
      locks: null,
      preimages: null,
    });
  });
  it("keeps an impossible Taproot script leaf separate from its available key path", () => {
    const paths = decodeDescriptor(`tr(${KEY.slice(2)},0)`).spendingPaths;
    expect(paths[0]).toContain("Taproot key path");
    expect(paths[1]).toContain("No satisfying path");
    expect(paths[1]).not.toContain("available immediately");
  });
});
