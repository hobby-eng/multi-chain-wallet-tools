// The dialog's fields beside the message (MessageFormatText.inputs), on the actual feature, worker
// client and coin policies: NEAR's recipient, nonce and callback URL, TON's domain, timestamp and the
// row's public key, and the row key and message rules of Cosmos and Hedera. The browser's Worker is
// the only fake.
import { afterEach, describe, expect, it } from "vitest";
import { field, paymentAddressField } from "@ckd/core/types.js";
import {
  releaseSigningFixtures,
  settle,
  signingFixture,
  WorkerBoundary,
} from "./message-signing-fixture.js";
import { combineMessageSigningPolicies } from "../src/ui/message-signing-policy.js";
import { NEAR_MESSAGE_SIGNING_POLICY } from "../src/ui/message-signing-policy-near.js";
import { TON_MESSAGE_SIGNING_POLICY } from "../src/ui/message-signing-policy-ton.js";
import { SOLANA_MESSAGE_SIGNING_POLICY } from "../src/ui/message-signing-policy-solana.js";
import { STELLAR_MESSAGE_SIGNING_POLICY } from "../src/ui/message-signing-policy-stellar.js";
import { COSMOS_MESSAGE_SIGNING_POLICY } from "../src/ui/message-signing-policy-cosmos.js";
import { HEDERA_MESSAGE_SIGNING_POLICY } from "../src/ui/message-signing-policy-hedera.js";

afterEach(releaseSigningFixtures);

/** RFC 8032's TEST 1 public key, a public test key, as the rows show it. */
const PUBLIC_KEY = "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";
const TON_ADDRESS = "UQCUp64SJJ505dIdcgHDG1oD8JKMLXpQzu5W6lLFdQGtA8kY";

const near = () =>
  signingFixture("near", () => true, {
    policy: NEAR_MESSAGE_SIGNING_POLICY,
    fields: [paymentAddressField("address", "Implicit account", PUBLIC_KEY)],
    address: PUBLIC_KEY,
  });
const ton = () =>
  signingFixture("ton-trust", () => true, {
    policy: TON_MESSAGE_SIGNING_POLICY,
    fields: [
      paymentAddressField("address", "Address (W5)", TON_ADDRESS),
      field("publicKey", "Public key (hex)", PUBLIC_KEY),
      field("privateKey", "Secret key", "private fixture value", true),
    ],
    address: TON_ADDRESS,
  });

/** Clicks Sign and answers the request the worker client posted, if any. */
async function signed(f: ReturnType<typeof signingFixture>) {
  f.sign.click();
  await settle();
  const worker = WorkerBoundary.instances.at(-1);
  worker?.emit({ type: "ready" });
  await settle();
  const request = worker?.requests[0];
  return request?.type === "sign-message" ? request : undefined;
}

describe("the dialog's fields beside the message", () => {
  it("draws NEAR's three fields, with a fresh nonce of 32 bytes in hex", () => {
    const f = near();
    const page = f.native.page;
    expect(page.require("message-signer-inputs").hidden).toBe(false);
    expect(page.require("message-signer-input-recipient").value).toBe("");
    expect(page.require("message-signer-input-nonce").value).toMatch(/^[0-9a-f]{64}$/u);
    expect(page.require("message-signer-input-callbackUrl").value).toBe("");
    expect(
      page.querySelectorAll("#message-signer-inputs label").map((label) => label.textContent),
    ).toEqual(["Recipient", "Nonce", "Callback URL (optional)"]);
  });

  it("sends NEAR's inputs with the request, and no secret of the row", async () => {
    const f = near();
    const page = f.native.page;
    page.require("message-signer-input-recipient").value = "public.example";
    const nonce = page.require("message-signer-input-nonce").value;
    const request = await signed(f);
    expect(request?.inputs).toEqual({ recipient: "public.example", nonce, callbackUrl: "" });
  });

  it("refuses an empty recipient with the standard's text before a seed is read", async () => {
    const f = near();
    expect(await signed(f)).toBeUndefined();
    expect(WorkerBoundary.instances).toHaveLength(0);
    expect(f.seeds).toHaveLength(0);
    expect(f.native.page.require("message-signer-error").textContent).toBe(
      "Enter the recipient the message is for, such as the app's domain.",
    );
  });

  it("retires the output when a field changes, as a message edit does", async () => {
    const f = near();
    const page = f.native.page;
    page.require("message-signer-input-recipient").value = "public.example";
    await signed(f);
    const nonce = page.require("message-signer-input-nonce");
    nonce.value = "00".repeat(32);
    nonce.dispatchEvent(new Event("input", { bubbles: true }));
    expect(f.output.value).toBe("");
    expect(WorkerBoundary.instances[0]?.terminate).toHaveBeenCalled();
  });

  it("carries TON's row public key, and keeps the domain when the format changes", async () => {
    const f = ton();
    const page = f.native.page;
    page.require("message-signer-input-domain").value = "public.example";
    expect(page.require("message-signer-input-timestamp").value).toMatch(/^\d{10}$/u);
    const select = page.require("message-signer-format-select");
    select.value = "ton-sign-data-binary";
    select.dispatchEvent(new Event("change"));
    expect(page.require("message-signer-input-domain").value).toBe("public.example");
    expect(page.require("message-signer-message-label").textContent).toBe("Bytes (hex)");
    f.message.value = "48656c6c6f";
    const request = await signed(f);
    expect(request?.format).toBe("ton-sign-data-binary");
    expect(request?.inputs).toMatchObject({ domain: "public.example", publicKey: PUBLIC_KEY });
    expect(JSON.stringify(request?.inputs)).not.toContain("private fixture value");
  });

  it("refuses binary bytes that are not hex pairs before any work", async () => {
    const f = ton();
    const page = f.native.page;
    page.require("message-signer-input-domain").value = "public.example";
    const select = page.require("message-signer-format-select");
    select.value = "ton-sign-data-binary";
    select.dispatchEvent(new Event("change"));
    f.message.value = "abc";
    expect(await signed(f)).toBeUndefined();
    expect(page.require("message-signer-error").textContent).toBe(
      "Enter the bytes as hex digits, two per byte.",
    );
  });

  it("forgets the fields when the dialog closes", () => {
    const f = near();
    const page = f.native.page;
    page.require("message-signer-input-recipient").value = "public.example";
    expect(page.querySelectorAll("#message-signer-inputs input")).toHaveLength(3);
    page.require("close-message-signer").click();
    expect(page.require("message-signer-inputs").hidden).toBe(true);
    expect(page.querySelectorAll("#message-signer-inputs input")).toHaveLength(0);
  });
});

describe("the account coins' row key and message rules", () => {
  const COMPRESSED_KEY = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

  it("carries a Cosmos row's compressed key with the request, and draws no field", async () => {
    const address = "cosmos1w508d6qejxtdg4y5r3zarvary0c5xw7k6ah60c";
    const f = signingFixture("cosmos", () => true, {
      policy: COSMOS_MESSAGE_SIGNING_POLICY,
      fields: [
        paymentAddressField("address", "Address", address),
        field("publicKey", "Compressed public key", COMPRESSED_KEY),
        field("privateKey", "Private key", "private fixture value", true),
      ],
      address,
    });
    expect(f.native.page.require("message-signer-inputs").hidden).toBe(true);
    const request = await signed(f);
    expect(request?.inputs).toEqual({ publicKey: COMPRESSED_KEY });
  });

  it("refuses a Hedera message that is not ASCII before any work", async () => {
    const address =
      "0.0.302a300506032b6570032100a2ef13761b644a651a1a4ac666eafbac419c97282f8af5c33f58d732e73e5a55";
    const f = signingFixture("hedera", () => true, {
      policy: HEDERA_MESSAGE_SIGNING_POLICY,
      fields: [paymentAddressField("address", "Account alias (HIP-32)", address)],
      address,
    });
    f.message.value = "Grüße";
    expect(await signed(f)).toBeUndefined();
    expect(f.seeds).toHaveLength(0);
    expect(f.native.page.require("message-signer-error").textContent).toBe(
      "Hedera wallets count the length of other text differently; use ASCII text.",
    );
  });
});

describe("the Ed25519 coins' offers", () => {
  const policies = combineMessageSigningPolicies(
    SOLANA_MESSAGE_SIGNING_POLICY,
    STELLAR_MESSAGE_SIGNING_POLICY,
    NEAR_MESSAGE_SIGNING_POLICY,
    TON_MESSAGE_SIGNING_POLICY,
  );

  it.each([
    ["solana", "address", ["solana-raw", "solana-offchain-v0"]],
    ["solana-ledger", "address", ["solana-raw", "solana-offchain-v0"]],
    ["stellar", "address", ["stellar-sep53"]],
    ["near", "address", ["near-nep413"]],
    ["near", "publicKey", []],
    ["ton", "addressv4R2", ["ton-sign-data-text", "ton-sign-data-binary"]],
    ["ton-trust", "addressW5", ["ton-sign-data-text", "ton-sign-data-binary"]],
    ["ton-ledger", "addressv3R2", ["ton-sign-data-text", "ton-sign-data-binary"]],
    ["ton-ledger", "bounceableW5", []],
  ])("offers on %s's %s field the formats %j", (resultId, addressKey, formats) => {
    expect(policies.offer(resultId, addressKey)).toEqual(formats);
  });

  it("refuses a Solana off-chain message over version 0's limit in the dialog, before any work", async () => {
    const address = "FVen3X669xLzsi6N2V91DoiyzHzg1uAgqiT8jZ9nS96Z";
    const f = signingFixture("solana", () => true, {
      policy: SOLANA_MESSAGE_SIGNING_POLICY,
      fields: [paymentAddressField("address", "Address", address)],
      address,
    });
    const select = f.native.page.require("message-signer-format-select");
    select.value = "solana-offchain-v0";
    select.dispatchEvent(new Event("change"));
    f.message.value = "a".repeat(65516);
    expect(await signed(f)).toBeUndefined();
    expect(f.native.page.require("message-signer-error").textContent).toBe(
      "Solana's off-chain message holds at most 65515 bytes.",
    );
  });

  it("refuses a Solana off-chain message over version 0's limit on the page", () => {
    const check = policies.describe("solana-offchain-v0")?.check;
    expect(() => check?.("a".repeat(65515), {})).not.toThrow();
    expect(() => check?.("a".repeat(65516), {})).toThrow(
      "Solana's off-chain message holds at most 65515 bytes.",
    );
  });
});
