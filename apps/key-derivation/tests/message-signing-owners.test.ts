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
import { SOLANA_MESSAGE_SIGNING } from "@ckd/coins/solana/message-signing.js";
import { STELLAR_MESSAGE_SIGNING } from "@ckd/coins/stellar/message-signing.js";
import { NEAR_MESSAGE_SIGNING } from "@ckd/coins/near/message-signing.js";
import { TON_MESSAGE_SIGNING } from "@ckd/coins/ton/message-signing.js";
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
import { SOLANA_MESSAGE_SIGNING_POLICY } from "../src/ui/message-signing-policy-solana.js";
import { STELLAR_MESSAGE_SIGNING_POLICY } from "../src/ui/message-signing-policy-stellar.js";
import { NEAR_MESSAGE_SIGNING_POLICY } from "../src/ui/message-signing-policy-near.js";
import { TON_MESSAGE_SIGNING_POLICY } from "../src/ui/message-signing-policy-ton.js";

const coins = [
  BITCOIN_MESSAGE_SIGNING,
  DASH_MESSAGE_SIGNING,
  LITECOIN_MESSAGE_SIGNING,
  DOGECOIN_MESSAGE_SIGNING,
  BITCOIN_CASH_MESSAGE_SIGNING,
  ZCASH_MESSAGE_SIGNING,
  ETHEREUM_MESSAGE_SIGNING,
  ETHEREUM_CLASSIC_MESSAGE_SIGNING,
  TRON_MESSAGE_SIGNING,
  SOLANA_MESSAGE_SIGNING,
  STELLAR_MESSAGE_SIGNING,
  NEAR_MESSAGE_SIGNING,
  TON_MESSAGE_SIGNING,
];
const signers = new MessageSigners(coins);
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
  SOLANA_MESSAGE_SIGNING_POLICY,
  STELLAR_MESSAGE_SIGNING_POLICY,
  NEAR_MESSAGE_SIGNING_POLICY,
  TON_MESSAGE_SIGNING_POLICY,
);
const FIELDS = [
  "address",
  "legacyAddress",
  "oldP2shAddress",
  "addressW5",
  "addressv4R2",
  "addressv3R2",
  "rawAddress",
];
/** The formats the page offers on any field of a row. */
const offered = (adapterId: string) =>
  new Set(FIELDS.flatMap((field) => policies.offer(adapterId, field)));

describe("the worker admits every format that the page offers, for the row that offers it", () => {
  it.each(COIN_ADAPTERS.map((adapter) => adapter.id))("admits %s's offers", (adapterId) => {
    for (const field of FIELDS)
      for (const format of policies.offer(adapterId, field))
        expect(() => signers.admit(format, adapterId)).not.toThrow();
  });

  it("offers every format the worker admits, on the row it admits it for", () => {
    for (const coin of coins)
      for (const [format, adapters] of Object.entries(coin.formats))
        for (const adapterId of adapters)
          // Dash's CoinJoin rows sign through their own worker adapter, under the core row's offer.
          if (adapterId !== "dash-core-coinjoin") expect(offered(adapterId)).toContain(format);
  });

  it("admits Dash's CoinJoin rows, whose worker adapter is their own", () => {
    expect(signers.admit("dash-compact", "dash-core-coinjoin")).toBeUndefined();
  });

  it("names the key field of the coins whose rows keep it elsewhere", () => {
    expect(signers.admit("ethereum-eip191", "ethereum")?.field).toBe("privateKey");
    expect(signers.admit("tron-tip191", "tron")?.field).toBe("privateKey");
    expect(signers.admit("solana-raw", "solana-ledger")?.field).toBe("privateKeyHex");
    expect(signers.admit("stellar-sep53", "stellar")?.field).toBe("privateKey");
    expect(signers.admit("near-nep413", "near")?.field).toBe("privateKeyHex");
    expect(signers.admit("ton-sign-data-binary", "ton")?.field).toBe("privateKey");
    expect(signers.admit("litecoin-compact-legacy", "litecoin-legacy")).toBeUndefined();
  });

  it.each([
    ["litecoin-compact-legacy", "litecoin-nested-segwit"],
    ["litecoin-compact-legacy", "litecoin-native-segwit"],
    ["litecoin-compact-native", "litecoin-legacy"],
    ["bitcoin-compact", "bitcoin-taproot"],
    ["bitcoin-bip322-taproot", "bitcoin-legacy"],
    ["solana-raw", "near"],
    ["stellar-sep53", "solana"],
    ["ton-sign-data-text", "stellar"],
  ])("refuses %s on a %s row, whose address type or coin does not sign it", (format, adapterId) => {
    expect(() => signers.admit(format, adapterId)).toThrow(
      expect.objectContaining({ code: "NOT_FOR_ROW" }),
    );
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
