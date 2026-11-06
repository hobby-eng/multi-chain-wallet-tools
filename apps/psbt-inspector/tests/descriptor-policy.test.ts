import { describe, expect, it } from "vitest";
import { DescriptorDecoder, DescriptorError } from "../src/descriptor.js";
import { expression, treeLeaves } from "../src/descriptor-policy.js";

describe("descriptor policy admission and reusable ownership", () => {
  it("keeps the published BIP380 raw descriptor output on repeated interpretation", () => {
    const decoder = new DescriptorDecoder("raw(deadbeef)#89f8spxm");
    const first = decoder.decode();
    const second = decoder.decode();
    expect(first.checksum).toBe("valid · 89f8spxm");
    expect(first.compiledOutput?.rows).toContainEqual({ label: "scriptPubKey", value: "deadbeef" });
    expect(second).toEqual(first);
    expect(second.pathCards).not.toBe(first.pathCards);
    Object.defineProperty(first.pathCards[0], "availability", { value: "synthetic mutation" });
    expect(second.pathCards[0]?.availability).toBe("Not summarized; review the symbolic policy");
  });

  it.each([null, [], new Date(0), { unoffered: true }])(
    "refuses malformed options without falling back to a network: case %#",
    (options) => {
      expect(() => DescriptorDecoder.selection(options)).toThrow(
        expect.objectContaining({ code: "descriptor.options" }),
      );
    },
  );

  it("uses the shared network and integer admission before derivation", () => {
    expect(
      DescriptorDecoder.selection({
        chain: "bitcoin",
        network: "regtest",
        multipathChoice: "1",
        wildcardIndex: "7",
      }),
    ).toEqual({
      chain: "bitcoin",
      network: "regtest",
      multipathChoice: 1,
      wildcardIndex: 7,
    });
    expect(() => DescriptorDecoder.selection({ chain: "dash", network: "regtest" })).toThrow(
      expect.objectContaining({ code: "INVALID_NETWORK" }),
    );
    expect(() => DescriptorDecoder.selection({ multipathChoice: 2 })).toThrow();
    expect(() => DescriptorDecoder.selection({ wildcardIndex: 2147483648 })).toThrow();
  });

  it("refuses oversized raw text before whitespace preprocessing", () => {
    expect(() => new DescriptorDecoder(" ".repeat(65537))).toThrow(
      expect.objectContaining({ code: "descriptor.input" }),
    );
    const failure = new DescriptorError("root");
    expect(failure.message).toBe("Unsupported top-level descriptor.");
  });

  it("bounds recursive expression and tree analysis with a coded refusal", () => {
    expect(() => expression(`${"wsh(".repeat(130)}1${")".repeat(130)}`)).toThrow(
      expect.objectContaining({ code: "descriptor.policy.depth" }),
    );
    let tree = "0";
    for (let depth = 0; depth < 130; depth += 1) tree = `{0,${tree}}`;
    expect(() => treeLeaves(tree)).toThrow(
      expect.objectContaining({ code: "descriptor.policy.depth" }),
    );
  });
});
