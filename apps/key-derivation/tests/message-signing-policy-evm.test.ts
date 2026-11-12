import { describe, expect, it } from "vitest";
import { combineMessageSigningPolicies } from "../src/ui/message-signing-policy.js";
import { ETHEREUM_MESSAGE_SIGNING_POLICY } from "../src/ui/message-signing-policy-ethereum.js";
import { ETHEREUM_CLASSIC_MESSAGE_SIGNING_POLICY } from "../src/ui/message-signing-policy-ethereum-classic.js";
import { TRON_MESSAGE_SIGNING_POLICY } from "../src/ui/message-signing-policy-tron.js";
import { EVM_SAME_SIGNATURE } from "../src/ui/message-signing-policy-evm.js";

const policies = combineMessageSigningPolicies(
  ETHEREUM_MESSAGE_SIGNING_POLICY,
  ETHEREUM_CLASSIC_MESSAGE_SIGNING_POLICY,
  TRON_MESSAGE_SIGNING_POLICY,
);

describe("Ethereum, Ethereum Classic and Tron offer their envelope formats", () => {
  it.each([
    ["ethereum", "address", ["ethereum-eip191"]],
    ["ethereum-classic", "address", ["ethereum-classic-eip191"]],
    ["tron", "address", ["tron-tip191"]],
    ["ethereum", "rawAddress", []],
    ["tron", "hexAddress", []],
    ["injective", "address", []],
  ])("offers %s's %s: %j", (resultId, field, formats) => {
    expect(policies.offer(resultId, field)).toEqual(formats);
  });

  it("says once, for Ethereum and Ethereum Classic alike, that the signature holds on every EVM chain", () => {
    const ethereum = policies.describe("ethereum-eip191");
    const classic = policies.describe("ethereum-classic-eip191");
    expect(ethereum?.label).toBe("Ethereum personal_sign (EIP-191), every EVM network");
    expect(ethereum?.notes[0]).toBe(EVM_SAME_SIGNATURE);
    expect(classic?.notes[0]).toBe(EVM_SAME_SIGNATURE);
    expect(EVM_SAME_SIGNATURE).toMatch(/no chain ID: EIP-155 covers transactions only/u);
    expect(policies.describe("tron-tip191")?.notes.join(" ")).not.toMatch(/EVM/u);
  });

  it.each(["ethereum-eip191", "ethereum-classic-eip191", "tron-tip191"])(
    "labels %s's signature as 0x hex, not compact",
    (format) => {
      expect(policies.describe(format)).toMatchObject({ output: "Signature (0x hex: r, s, v)" });
      expect(policies.describe(format)?.compact).toBeUndefined();
    },
  );
});
