import { describe, expect, it } from "vitest";
import { COIN_ADAPTERS } from "@ckd/coins/registry.js";
import { MessageSigners } from "@ckd/coins/message-signing.js";
import { BITCOIN_MESSAGE_SIGNING } from "@ckd/coins/bitcoin/message-signing.js";
import { DASH_MESSAGE_SIGNING } from "@ckd/coins/dash/message-signing.js";
import { LITECOIN_MESSAGE_SIGNING } from "@ckd/coins/litecoin/message-signing.js";
import { DOGECOIN_MESSAGE_SIGNING } from "@ckd/coins/dogecoin/message-signing.js";
import { BITCOIN_CASH_MESSAGE_SIGNING } from "@ckd/coins/bitcoin-cash/message-signing.js";
import { ZCASH_MESSAGE_SIGNING } from "@ckd/coins/zcash/message-signing.js";
import { ETHEREUM_MESSAGE_SIGNING } from "@ckd/coins/ethereum/message-signing.js";
import { ETHEREUM_CLASSIC_MESSAGE_SIGNING } from "@ckd/coins/ethereum-classic/message-signing.js";
import { TRON_MESSAGE_SIGNING } from "@ckd/coins/tron/message-signing.js";
import { combineMessageSigningPolicies } from "../src/ui/message-signing-policy.js";
import { BITCOIN_MESSAGE_SIGNING_POLICY } from "../src/ui/message-signing-policy-bitcoin.js";
import { DASH_MESSAGE_SIGNING_POLICY } from "../src/ui/message-signing-policy-dash.js";
import { LITECOIN_MESSAGE_SIGNING_POLICY } from "../src/ui/message-signing-policy-litecoin.js";
import { DOGECOIN_MESSAGE_SIGNING_POLICY } from "../src/ui/message-signing-policy-dogecoin.js";
import { BITCOIN_CASH_MESSAGE_SIGNING_POLICY } from "../src/ui/message-signing-policy-bitcoin-cash.js";
import { ZCASH_MESSAGE_SIGNING_POLICY } from "../src/ui/message-signing-policy-zcash.js";
import { ETHEREUM_MESSAGE_SIGNING_POLICY } from "../src/ui/message-signing-policy-ethereum.js";
import { ETHEREUM_CLASSIC_MESSAGE_SIGNING_POLICY } from "../src/ui/message-signing-policy-ethereum-classic.js";
import { TRON_MESSAGE_SIGNING_POLICY } from "../src/ui/message-signing-policy-tron.js";

const signers = new MessageSigners([
  BITCOIN_MESSAGE_SIGNING,
  DASH_MESSAGE_SIGNING,
  LITECOIN_MESSAGE_SIGNING,
  DOGECOIN_MESSAGE_SIGNING,
  BITCOIN_CASH_MESSAGE_SIGNING,
  ZCASH_MESSAGE_SIGNING,
  ETHEREUM_MESSAGE_SIGNING,
  ETHEREUM_CLASSIC_MESSAGE_SIGNING,
  TRON_MESSAGE_SIGNING,
]);
const policies = combineMessageSigningPolicies(
  BITCOIN_MESSAGE_SIGNING_POLICY,
  DASH_MESSAGE_SIGNING_POLICY,
  LITECOIN_MESSAGE_SIGNING_POLICY,
  DOGECOIN_MESSAGE_SIGNING_POLICY,
  BITCOIN_CASH_MESSAGE_SIGNING_POLICY,
  ZCASH_MESSAGE_SIGNING_POLICY,
  ETHEREUM_MESSAGE_SIGNING_POLICY,
  ETHEREUM_CLASSIC_MESSAGE_SIGNING_POLICY,
  TRON_MESSAGE_SIGNING_POLICY,
);
const FIELDS = ["address", "legacyAddress", "oldP2shAddress", "addressW5", "rawAddress"];

describe("the worker admits every format that the page offers, for the row that offers it", () => {
  it.each(COIN_ADAPTERS.map((adapter) => adapter.id))("admits %s's offers", (adapterId) => {
    for (const field of FIELDS)
      for (const format of policies.offer(adapterId, field))
        expect(() => signers.admit(format, adapterId)).not.toThrow();
  });

  it("admits Dash's CoinJoin rows, whose worker adapter is their own", () => {
    expect(signers.admit("dash-compact", "dash-core-coinjoin")).toBeUndefined();
  });

  it("names the key field of the envelope coins only", () => {
    expect(signers.admit("ethereum-eip191", "ethereum")).toBe("privateKey");
    expect(signers.admit("tron-tip191", "tron")).toBe("privateKey");
    expect(signers.admit("litecoin-compact-legacy", "litecoin-legacy")).toBeUndefined();
  });

  it("refuses every format on a row of another coin", () => {
    expect(() => signers.admit("ethereum-eip191", "hedera-ecdsa")).toThrow(
      expect.objectContaining({ code: "NOT_FOR_ROW" }),
    );
    expect(() => signers.admit("bitcoin-bip322-nested", "litecoin-nested-segwit")).toThrow(
      expect.objectContaining({ code: "NOT_FOR_ROW" }),
    );
    expect(() => signers.admit("unknown", "ethereum")).toThrow(
      expect.objectContaining({ code: "UNSUPPORTED_FORMAT" }),
    );
  });
});
