import { afterEach, expect, it, vi } from "vitest";
import { getRuntimeCoinAdapter } from "@ckd/coins/runtime-registry.js";
import { runDerivationSelfTest } from "@ckd/derivation-self-test";
import { MessageSigners } from "@ckd/coins/message-signing.js";
import { BITCOIN_MESSAGE_SIGNING } from "@ckd/coins/bitcoin/message-signing.js";
import { ETHEREUM_MESSAGE_SIGNING } from "@ckd/coins/ethereum/message-signing.js";
import { ETHEREUM_CLASSIC_MESSAGE_SIGNING } from "@ckd/coins/ethereum-classic/message-signing.js";
import { TRON_MESSAGE_SIGNING } from "@ckd/coins/tron/message-signing.js";
import { LITECOIN_MESSAGE_SIGNING } from "@ckd/coins/litecoin/message-signing.js";
import { SOLANA_MESSAGE_SIGNING } from "@ckd/coins/solana/message-signing.js";
import { STELLAR_MESSAGE_SIGNING } from "@ckd/coins/stellar/message-signing.js";
import { NEAR_MESSAGE_SIGNING } from "@ckd/coins/near/message-signing.js";
import { TON_MESSAGE_SIGNING } from "@ckd/coins/ton/message-signing.js";
import { COSMOS_MESSAGE_SIGNING } from "@ckd/coins/cosmos/message-signing.js";
import { INJECTIVE_MESSAGE_SIGNING } from "@ckd/coins/injective/message-signing.js";
import { HEDERA_MESSAGE_SIGNING } from "@ckd/coins/hedera/message-signing.js";
import { CARDANO_MESSAGE_SIGNING } from "@ckd/coins/cardano/message-signing.js";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { clearDerivationResult } from "@ckd/core/secrets.js";
import { TEST_MNEMONIC } from "@ckd/test-support/helpers.js";
import { startDerivationWorker } from "../src/workers/worker-runtime.js";
import type { WorkerMessage, WorkerRequest } from "../src/workers/protocol.js";

afterEach(() => vi.unstubAllGlobals());

const signers = new MessageSigners([
  BITCOIN_MESSAGE_SIGNING,
  ETHEREUM_MESSAGE_SIGNING,
  ETHEREUM_CLASSIC_MESSAGE_SIGNING,
  TRON_MESSAGE_SIGNING,
  LITECOIN_MESSAGE_SIGNING,
  SOLANA_MESSAGE_SIGNING,
  STELLAR_MESSAGE_SIGNING,
  NEAR_MESSAGE_SIGNING,
  TON_MESSAGE_SIGNING,
  COSMOS_MESSAGE_SIGNING,
  INJECTIVE_MESSAGE_SIGNING,
  HEDERA_MESSAGE_SIGNING,
  CARDANO_MESSAGE_SIGNING,
]);
const input = (branch = 0) => ({
  seed: mnemonicToSeed(TEST_MNEMONIC),
  network: "mainnet" as const,
  account: 0,
  branch,
  start: 0,
  count: 1,
});

/** The value of row 0's field `key` for an adapter, from the public test phrase. */
async function rowValue(adapterId: string, key: string, branch = 0) {
  const arranged = await getRuntimeCoinAdapter(adapterId).derive(input(branch));
  const row = arranged.rows[0]!;
  const value = [...row.basic, ...row.advanced].find((field) => field.key === key)!.value;
  clearDerivationResult(arranged);
  return value;
}

/** Sends one request to a worker runtime that records whether it derived anything. */
async function send(data: Record<string, unknown>, admit = true) {
  let listener: ((event: MessageEvent<WorkerRequest>) => void) | undefined;
  const messages: WorkerMessage[] = [];
  vi.stubGlobal("self", {
    addEventListener(_type: string, callback: typeof listener) {
      listener = callback;
    },
    postMessage(message: WorkerMessage) {
      messages.push(structuredClone(message));
    },
  });
  const derived: string[] = [];
  startDerivationWorker({
    getRuntimeCoinAdapter: (id) => {
      const actual = getRuntimeCoinAdapter(id);
      return {
        ...actual,
        derive: (request) => {
          derived.push(id);
          return actual.derive(request);
        },
      };
    },
    runDerivationSelfTest,
    signDerivedMessage: signers.sign,
    verifyDerivedMessage: signers.verify,
    ...(admit ? { admitMessageSigning: signers.admit } : {}),
  });
  // A request crafted outside the page's own paths is fed on purpose here, to see it refused.
  listener?.(new MessageEvent("message", { data: { id: 1, ...data } as WorkerRequest }));
  await vi.waitFor(() => expect(messages.some((message) => "id" in message)).toBe(true));
  return { reply: messages.find((message) => "id" in message), derived };
}

const signing = async (
  adapterId: string,
  format: string,
  addressKey = "address",
  inputs?: Record<string, string>,
) => ({
  type: "sign-message",
  adapterId,
  input: input(),
  address: await rowValue(adapterId, addressKey),
  addressKey,
  message: "Public admission fixture",
  format,
  ...(inputs === undefined ? {} : { inputs }),
});

it("signs an Ethereum row with the key from the field its coin names", async () => {
  const request = await signing("ethereum", "ethereum-eip191");
  const { reply, derived } = await send(request);
  expect(reply).toMatchObject({ ok: true, type: "sign-message", result: { verified: true } });
  expect(derived).toEqual(["ethereum"]);
  if (reply !== undefined && "ok" in reply && reply.ok && reply.type === "sign-message")
    expect(
      await signers.verify(
        {
          format: "ethereum-eip191",
          address: request.address,
          message: request.message,
          network: "mainnet",
        },
        reply.result.signature,
      ),
    ).toBe(true);
});

it.each([
  ["an EIP-191 format on Hedera's EVM alias", "hedera-ecdsa", "ethereum-eip191", "address"],
  [
    "Ethereum Classic's format on Hedera's EVM alias",
    "hedera-ecdsa",
    "ethereum-classic-eip191",
    "address",
  ],
  [
    "BIP-322 on Litecoin's old 3… form",
    "litecoin-nested-segwit",
    "bitcoin-bip322-nested",
    "oldP2shAddress",
  ],
  ["Tron's format on an Ethereum row", "ethereum", "tron-tip191", "address"],
  ["Ethereum's format on a Cosmos row", "cosmos", "ethereum-eip191", "address"],
  [
    "Litecoin Core's untyped format on a nested SegWit row",
    "litecoin-nested-segwit",
    "litecoin-compact-legacy",
    "address",
  ],
  ["Solana's format on a NEAR row", "near", "solana-raw", "address"],
  ["SEP-53 on a Solana row", "solana", "stellar-sep53", "address"],
  ["Hedera's ECDSA format on its Ed25519 row", "hedera", "hedera-hip820-ecdsa", "address"],
  ["Injective's ADR-036 on a Cosmos row", "cosmos", "injective-adr036", "address"],
  ["CIP-30 signData on a Solana row", "solana", "cardano-cip30", "address"],
])("refuses %s before deriving anything", async (_name, adapterId, format, addressKey) => {
  const { reply, derived } = await send(await signing(adapterId, format, addressKey));
  expect(reply).toMatchObject({ ok: false, errorCode: "NOT_FOR_ROW" });
  expect(derived).toEqual([]);
});

const NEAR_INPUTS = { recipient: "public.example", nonce: "00".repeat(32) };
const TON_INPUTS = { domain: "public.example", timestamp: "1700000000" };

it.each([
  ["solana", "solana-raw", "address", undefined],
  ["solana-ledger", "solana-offchain-v0", "address", undefined],
  ["stellar", "stellar-sep53", "address", undefined],
  ["near", "near-nep413", "address", NEAR_INPUTS],
  ["ton-trust", "ton-sign-data-text", "address", TON_INPUTS],
  ["ton-ledger", "ton-sign-data-text", "addressv3R2", TON_INPUTS],
  // The Telegram wallet's row, whose key comes from a TON phrase's entropy, at its W5 address.
  ["ton", "ton-sign-data-text", "address", TON_INPUTS],
  ["hedera", "hedera-hip820-ed25519", "address", undefined],
  // The secp256k1 rows whose signatures carry no recovery id: verification reads the row's key.
  ["cosmos", "cosmos-adr036", "address", undefined],
  ["injective", "injective-adr036", "address", undefined],
  ["injective", "injective-eip191", "address", undefined],
  ["hedera-ecdsa", "hedera-hip820-ecdsa", "address", undefined],
] as const)(
  "signs a %s row in %s with the key its coin reads from the row",
  async (adapterId, format, addressKey, inputs) => {
    const request = await signing(adapterId, format, addressKey, inputs);
    const { reply, derived } = await send(request);
    expect(reply).toMatchObject({ ok: true, type: "sign-message", result: { verified: true } });
    expect(derived).toEqual([adapterId]);
    if (reply === undefined || !("ok" in reply) || !reply.ok || reply.type !== "sign-message")
      return;
    const publicKey = await rowValue(adapterId, "publicKey");
    const verification = {
      format,
      address: request.address,
      message: request.message,
      network: "mainnet" as const,
      // Every request carries the row's public key, which only some standards read.
      inputs: { ...inputs, publicKey },
    };
    expect(await signers.verify(verification, reply.result.signature)).toBe(true);
    expect(await signers.verify({ ...verification, message: "61" }, reply.result.signature)).toBe(
      false,
    );
  },
);

// Cardano's Ledger rows read BIP39's seed, as this fixture gives it: a receive key's base and
// enterprise addresses and a stake key's reward address (role 2), each signed with the row's own
// signingKey and verified with its publicKeyHex.
it.each([
  ["address", 0],
  ["enterpriseAddress", 0],
  ["address", 2],
] as const)(
  "signs a Cardano Ledger row's %s (role %i) with the key of its signingKey field",
  async (addressKey, branch) => {
    const request = {
      ...(await signing("cardano-ledger", "cardano-cip30", addressKey)),
      input: input(branch),
      address: await rowValue("cardano-ledger", addressKey, branch),
    };
    const { reply, derived } = await send(request);
    expect(reply).toMatchObject({ ok: true, type: "sign-message", result: { verified: true } });
    expect(derived).toEqual(["cardano-ledger"]);
    if (reply === undefined || !("ok" in reply) || !reply.ok || reply.type !== "sign-message")
      return;
    const verification = {
      format: "cardano-cip30",
      address: request.address,
      message: request.message,
      network: "mainnet" as const,
      inputs: { publicKeyHex: await rowValue("cardano-ledger", "publicKeyHex", branch) },
    };
    expect(await signers.verify(verification, reply.result.signature)).toBe(true);
    expect(await signers.verify({ ...verification, message: "61" }, reply.result.signature)).toBe(
      false,
    );
  },
);

it("refuses to verify a format for a row of another coin", async () => {
  const { reply } = await send({
    type: "verify-message",
    adapterId: "tron",
    request: {
      format: "ethereum-eip191",
      address: "public",
      message: "public",
      network: "mainnet",
    },
    signature: `0x${"11".repeat(64)}1b`,
  });
  expect(reply).toMatchObject({ ok: false, errorCode: "NOT_FOR_ROW" });
});

it("signs nothing in a build that composed no admission", async () => {
  const { reply, derived } = await send(await signing("ethereum", "ethereum-eip191"), false);
  expect(reply).toMatchObject({
    ok: false,
    error: "Message signing is unavailable in this build profile.",
  });
  expect(derived).toEqual([]);
});
