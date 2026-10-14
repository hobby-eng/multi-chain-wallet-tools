import { describe, expect, it } from "vitest";
import { selectedSelfTestSource } from "./psbt-inspector-composition.mjs";

function options(coins, features) {
  return { hasCoin: (coin) => coins.includes(coin), has: (feature) => features.includes(feature) };
}

const ALL = [
  "psbt-decoder",
  "script-decoder",
  "descriptor-decoder",
  "policy-builder",
  "multisig-wallet",
  "message-verification",
  "bip38-decrypt",
];

describe("the Inspector's self-test composition", () => {
  it("brings a Dash-only build Dash checks only, the slow ones in the full self-test", () => {
    const source = selectedSelfTestSource("/workspace", options(["dash"], ALL));
    expect(source.imports.join("\n")).not.toContain("self-test-bitcoin");
    expect(source.startup).toEqual([
      "dashPsbtDecoder",
      "dashScriptDecoder",
      "dashPolicyBuilder",
      "dashMultisigWallet",
      "dashMessageVerification",
      "dashDescriptorDecoder",
    ]);
    expect(source.full).toEqual(["dashBip38Decrypt"]);
  });

  it("brings each feature's checks with the feature only", () => {
    const source = selectedSelfTestSource("/workspace", options(["bitcoin"], ["script-decoder"]));
    expect(source.startup).toEqual(["bitcoinScriptDecoder"]);
    expect(source.full).toEqual([]);
    expect(source.imports.join("\n")).not.toContain("self-test-dash");
  });
});
