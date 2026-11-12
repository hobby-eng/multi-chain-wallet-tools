import { describe, expect, it } from "vitest";
import { combineMessageSigningPolicies } from "../src/ui/message-signing-policy.js";
import { BITCOIN_MESSAGE_SIGNING_POLICY as bitcoin } from "../src/ui/message-signing-policy-bitcoin.js";
import { DASH_MESSAGE_SIGNING_POLICY as dash } from "../src/ui/message-signing-policy-dash.js";

describe("the address owner offers its message-signing formats", () => {
  it.each([
    ["bitcoin-legacy", ["bitcoin-bip322-legacy", "bitcoin-compact"]],
    ["bitcoin-nested-segwit", ["bitcoin-bip322-nested"]],
    ["bitcoin-native-segwit", ["bitcoin-bip322-native"]],
    ["bitcoin-taproot", ["bitcoin-bip322-taproot"]],
  ])("offers %s its BIP-322 default first, and the compact form only for P2PKH", (id, formats) => {
    expect(bitcoin.offer(id, "address")).toEqual(formats);
    expect(bitcoin.offer(id, "legacyAddress")).toEqual([]);
    expect(dash.offer(id, "address")).toEqual([]);
  });

  it("keeps Dash applicability with the address family and its own address field", () => {
    for (const id of ["dash-core", "dash-legacy-mobile", "dash-core-coinjoin"]) {
      expect(dash.offer(id, "address")).toEqual(["dash-compact"]);
      expect(dash.offer(id, "publicKey")).toEqual([]);
      expect(bitcoin.offer(id, "address")).toEqual([]);
    }
    expect(dash.offer("dash-platform", "address")).toEqual([]);
  });

  it("refuses inherited keys as result ids", () => {
    expect(bitcoin.offer("constructor", "address")).toEqual([]);
    expect(bitcoin.offer("__proto__", "address")).toEqual([]);
  });

  it("describes only its own formats, without coercing unknown input", () => {
    expect(bitcoin.describe("bitcoin-compact")).toEqual({
      label: "Bitcoin compact P2PKH (BIP137)",
      output: "Base64 signature",
      notes: [
        "BIP-322 is the current general-purpose Bitcoin message-signing standard. Use compact BIP137 only for software that does not support BIP-322.",
      ],
      compact: true,
    });
    expect(bitcoin.describe("bitcoin-bip322-legacy")?.compact).toBeUndefined();
    expect(bitcoin.describe("bitcoin-bip322-taproot")?.label).toBe("Bitcoin BIP-322 simple · P2TR");
    expect(bitcoin.describe("dash-compact")).toBeUndefined();
    expect(dash.describe("dash-compact")).toEqual({
      label: "Dash Core compact P2PKH",
      output: "Base64 signature",
      notes: [],
      compact: true,
    });
    expect(dash.describe({ toString: () => "dash-compact" })).toBeUndefined();
  });

  it("delegates composite offers and texts to the coin that owns them", () => {
    const policies = combineMessageSigningPolicies(bitcoin, dash);
    expect(policies.offer("bitcoin-legacy", "address")).toEqual([
      "bitcoin-bip322-legacy",
      "bitcoin-compact",
    ]);
    expect(policies.offer("dash-core", "address")).toEqual(["dash-compact"]);
    expect(policies.offer("unknown", "address")).toEqual([]);
    expect(policies.describe("dash-compact")?.label).toBe("Dash Core compact P2PKH");
    expect(policies.describe({ toString: () => "dash-compact" })).toBeUndefined();
  });
});
