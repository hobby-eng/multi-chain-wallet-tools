import { describe, expect, it } from "vitest";
import { combineMessageSigningPolicies } from "../src/ui/message-signing-policy.js";
import { BITCOIN_MESSAGE_SIGNING_POLICY as bitcoin } from "../src/ui/message-signing-policy-bitcoin.js";
import { DASH_MESSAGE_SIGNING_POLICY as dash } from "../src/ui/message-signing-policy-dash.js";

describe("the address owner admits its offered message-signing formats", () => {
  it.each([
    ["bitcoin-legacy", "bitcoin-bip322-legacy"],
    ["bitcoin-nested-segwit", "bitcoin-bip322-nested"],
    ["bitcoin-native-segwit", "bitcoin-bip322-native"],
    ["bitcoin-taproot", "bitcoin-bip322-taproot"],
  ])("keeps the default for %s and refuses other address modes", (id, format) => {
    expect(bitcoin.format(id)).toBe(format);
    expect(bitcoin.choose(id, format)).toBe(format);
    expect(bitcoin.choose(id, "dash-compact")).toBeNull();
    expect(bitcoin.choose(id, { toString: () => format })).toBeNull();
    expect(bitcoin.choose(id, "bitcoin-compact")).toBe(
      id === "bitcoin-legacy" ? "bitcoin-compact" : null,
    );
  });

  it("keeps Dash applicability with the address family and refuses Bitcoin choices", () => {
    for (const id of ["dash-core", "dash-legacy-mobile", "dash-core-coinjoin"]) {
      expect(dash.choose(id, "dash-compact")).toBe("dash-compact");
      expect(dash.choose(id, "bitcoin-compact")).toBeNull();
    }
    expect(dash.choose("dash-platform", "dash-compact")).toBeNull();
  });

  it("delegates composite choices and labels without coercing unknown input", () => {
    const policies = combineMessageSigningPolicies(bitcoin, dash);
    expect(policies.choose("bitcoin-legacy", "bitcoin-compact")).toBe("bitcoin-compact");
    expect(policies.choose("dash-core", "dash-compact")).toBe("dash-compact");
    expect(policies.choose("unknown", "dash-compact")).toBeNull();
    expect(policies.label("dash-compact")).toBe("Dash Core compact P2PKH");
    expect(policies.label({ toString: () => "dash-compact" })).toBe("");
  });
});
