import { describe, expect, it } from "vitest";
import { combineMessageSigningPolicies } from "../src/ui/message-signing-policy.js";
import { BITCOIN_MESSAGE_SIGNING_POLICY } from "../src/ui/message-signing-policy-bitcoin.js";
import { BITCOIN_CASH_MESSAGE_SIGNING_POLICY } from "../src/ui/message-signing-policy-bitcoin-cash.js";
import { DASH_MESSAGE_SIGNING_POLICY } from "../src/ui/message-signing-policy-dash.js";
import { DOGECOIN_MESSAGE_SIGNING_POLICY } from "../src/ui/message-signing-policy-dogecoin.js";
import { LITECOIN_MESSAGE_SIGNING_POLICY } from "../src/ui/message-signing-policy-litecoin.js";
import { ZCASH_MESSAGE_SIGNING_POLICY } from "../src/ui/message-signing-policy-zcash.js";

const policies = combineMessageSigningPolicies(
  BITCOIN_MESSAGE_SIGNING_POLICY,
  DASH_MESSAGE_SIGNING_POLICY,
  LITECOIN_MESSAGE_SIGNING_POLICY,
  DOGECOIN_MESSAGE_SIGNING_POLICY,
  BITCOIN_CASH_MESSAGE_SIGNING_POLICY,
  ZCASH_MESSAGE_SIGNING_POLICY,
);

describe("the compact coins offer their formats on their own address fields", () => {
  it.each([
    ["litecoin-legacy", "address", ["litecoin-compact-legacy"]],
    ["litecoin-nested-segwit", "address", ["litecoin-compact-nested"]],
    ["litecoin-native-segwit", "address", ["litecoin-compact-native"]],
    ["litecoin-nested-segwit", "oldP2shAddress", []],
    ["dogecoin", "address", ["dogecoin-compact"]],
    ["bitcoin-cash", "address", ["bitcoin-cash-compact"]],
    ["bitcoin-cash", "legacyAddress", ["bitcoin-cash-compact"]],
    ["bitcoin-cash-coin-type-0", "legacyAddress", ["bitcoin-cash-compact"]],
    ["zcash", "address", ["zcash-compact"]],
    ["zcash", "publicKey", []],
    ["xrp", "address", []],
    ["bitcoin-legacy", "legacyAddress", []],
  ])("offers %s's %s: %j", (resultId, field, formats) => {
    expect(policies.offer(resultId, field)).toEqual(formats);
  });

  it.each([
    ["litecoin-compact-legacy", "Litecoin Core compact P2PKH", 0],
    ["litecoin-compact-nested", "Litecoin compact P2SH-P2WPKH (BIP137)", 1],
    ["litecoin-compact-native", "Litecoin compact P2WPKH (BIP137)", 1],
    ["dogecoin-compact", "Dogecoin Core compact P2PKH", 0],
    ["bitcoin-cash-compact", "Bitcoin Cash compact P2PKH (Bitcoin's message format)", 1],
    ["zcash-compact", "Zcash compact t1 P2PKH", 1],
  ])("describes %s as a compact Base64 format", (format, label, notes) => {
    const text = policies.describe(format);
    expect(text).toMatchObject({ label, output: "Base64 signature", compact: true });
    expect(text?.notes).toHaveLength(notes);
  });

  it("tells both Bitcoin and Bitcoin Cash that their compact signatures prove the other chain too", () => {
    expect(policies.describe("bitcoin-cash-compact")?.notes[0]).toMatch(
      /also valid for the Bitcoin address 1… of the same key/u,
    );
    expect(policies.describe("bitcoin-compact")?.notes[1]).toMatch(
      /also valid for the Bitcoin Cash address of the same key/u,
    );
    expect(policies.describe("bitcoin-bip322-legacy")?.notes.join(" ")).not.toMatch(
      /Bitcoin Cash/u,
    );
  });
});
