import { afterEach, describe, expect, it } from "vitest";
import { MessageSignatureText } from "@ckd/core/message-signature.js";
import {
  releaseSigningFixtures,
  settle,
  signingFixture,
  WorkerBoundary,
} from "./message-signing-fixture.js";

const PASTED = "public pasted signature";
// The compact signature of the public key 1 (message-signer-self-test-bitcoin.ts).
const COMPACT =
  "H3fcO9sr+K04dbegeXN7uU1PRgo538UFG5eawYMXK8ZxfE8LegyeCj3CKIR87lMZ0xaktP65In3kejkdZhi8da8=";

/** Opens a dialog with a pasted signature; `verify()` clicks Verify and returns its request. */
function fixture(id = "bitcoin-taproot", ready = () => true) {
  const f = signingFixture(id, ready);
  const page = f.native.page;
  const signature = page.require("message-verification-signature");
  signature.value = PASTED;
  const result = page.require("message-verification-result");
  const error = page.require("message-verification-error");
  const button = page.require("verify-message-signature-button");
  const verify = async () => {
    button.click();
    const worker = WorkerBoundary.instances.at(-1);
    if (worker === undefined) throw new Error("The dialog did not create its native worker.");
    worker.emit({ type: "ready" });
    await settle();
    const request = worker.requests[0];
    if (request?.type !== "verify-message")
      throw new Error("The client did not post its verification request.");
    return { worker, request };
  };
  return { ...f, page, signature, result, error, button, verify };
}

afterEach(releaseSigningFixtures);

describe("the signing dialog verifies a pasted signature from public data alone", () => {
  it("sends the row's address, network, format and message, and no seed", async () => {
    const f = fixture();
    const { worker, request } = await f.verify();
    expect(request).toEqual({
      id: 1,
      type: "verify-message",
      request: {
        format: "bitcoin-bip322-taproot",
        address: "public fixture address",
        message: "Public message fixture",
        network: "mainnet",
      },
      signature: PASTED,
    });
    expect(f.seeds).toHaveLength(0);
    expect(f.button.disabled).toBe(true);
    worker.emit({ id: request.id, ok: true, type: "verify-message", result: true });
    await settle();
    expect(f.result.textContent).toBe(
      "Valid for public fixture address · Bitcoin BIP-322 simple · P2TR",
    );
    expect(f.button.disabled).toBe(false);
    expect(worker.terminate).toHaveBeenCalled();
  });

  it("says when the signature is not valid for the address", async () => {
    const f = fixture("dash-core");
    const { worker, request } = await f.verify();
    expect(request.request.format).toBe("dash-compact");
    worker.emit({ id: request.id, ok: true, type: "verify-message", result: false });
    await settle();
    expect(f.result.textContent).toBe("Not valid for this address · Dash Core compact P2PKH");
    expect(f.error.hidden).toBe(true);
  });

  it("verifies in the format chosen in the menu", async () => {
    const f = fixture("bitcoin-legacy");
    const select = f.page.require("message-signer-format-select");
    expect(f.page.require("message-signer-format-field").hidden).toBe(false);
    expect(select.value).toBe("bitcoin-bip322-legacy");
    select.value = "bitcoin-compact";
    select.dispatchEvent(new Event("change"));
    expect(f.page.require("message-signer-format").textContent).toBe(
      "Bitcoin compact P2PKH (BIP137)",
    );
    expect(f.page.require("message-signer-notes").hidden).toBe(false);
    expect(f.page.require("message-signature-output-label").textContent).toBe("Base64 signature");
    const { request } = await f.verify();
    expect(request.request.format).toBe("bitcoin-compact");
  });

  it.each([
    ["no signature", "  ", "Paste the signature to verify."],
    [
      "an oversized signature",
      "a".repeat(MessageSignatureText.maxCharacters + 1),
      `The signature exceeds ${MessageSignatureText.maxCharacters} characters.`,
    ],
  ])("refuses %s before creating a worker", async (_name, text, message) => {
    const f = fixture();
    f.signature.value = text;
    f.button.click();
    await settle();
    expect(WorkerBoundary.instances).toHaveLength(0);
    expect(f.error.textContent).toBe(message);
  });

  it("refuses before the cryptographic self-test has passed", async () => {
    const f = fixture("bitcoin-taproot", () => false);
    f.button.click();
    await settle();
    expect(WorkerBoundary.instances).toHaveLength(0);
    expect(f.error.textContent).toContain("self-test");
  });
});

describe("the signing dialog names what it refused, and keeps answers current", () => {
  it.each([
    ["INVALID_BASE64", "This signature is not in the selected format."],
    ["INVALID_HEADER", "This signature is not in the selected format."],
    ["UNREADABLE_SIGNATURE", "This signature is not in the selected format."],
    ["SIMPLE_FOR_ADDRESS", "This signature is not in the selected format."],
    ["RECOVERY_FAILED", "No public key can be recovered from this signature: it is damaged."],
    ["VERIFICATION_UNAVAILABLE", "The signature could not be checked."],
    ["UNRECOGNIZED", "The signature could not be checked."],
  ])("names a worker refusal %s without its supplied detail", async (code, text) => {
    const f = fixture();
    const { worker, request } = await f.verify();
    worker.emit({ id: request.id, ok: false, error: "Public fake worker detail", errorCode: code });
    await settle();
    expect(f.error.textContent).toBe(text);
    expect(f.result.textContent).toBe("");
  });

  it.each(["message", "signature", "format"])(
    "retires a pending answer when the %s changes",
    async (change) => {
      const f = fixture("bitcoin-legacy");
      const { worker, request } = await f.verify();
      if (change === "message") {
        f.message.value = "Another public message";
        f.message.dispatchEvent(new Event("input"));
      }
      if (change === "signature") {
        f.signature.value = "another public signature";
        f.signature.dispatchEvent(new Event("input"));
      }
      if (change === "format") {
        const select = f.page.require("message-signer-format-select");
        select.value = "bitcoin-compact";
        select.dispatchEvent(new Event("change"));
      }
      expect(worker.terminate).toHaveBeenCalled();
      worker.emit({ id: request.id, ok: true, type: "verify-message", result: true });
      await settle();
      expect(f.result.textContent).toBe("");
      expect(f.button.disabled).toBe(false);
    },
  );

  it("empties the pasted signature and its answer when the dialog closes", async () => {
    const f = fixture();
    const { worker, request } = await f.verify();
    worker.emit({ id: request.id, ok: true, type: "verify-message", result: true });
    await settle();
    f.page.require("close-message-signer").click();
    expect(f.signature.value).toBe("");
    expect(f.result.textContent).toBe("");
  });

  it.each([
    ["bitcoin-legacy", COMPACT, true],
    ["bitcoin-legacy", "smpAkcwRAIgZRfIY3p7", false],
    ["bitcoin-taproot", COMPACT, false],
  ])(
    "on %s, points a compact signature to the compact format: %s, %s",
    async (id, pasted, hinted) => {
      const f = fixture(id);
      f.signature.value = pasted;
      const { worker, request } = await f.verify();
      worker.emit({
        id: request.id,
        ok: false,
        error: "detail",
        errorCode: "UNREADABLE_SIGNATURE",
      });
      await settle();
      expect(f.error.textContent).toBe(
        hinted
          ? "This is a compact signature: choose “Bitcoin compact P2PKH (BIP137)” as the signature format to check it."
          : "This signature is not in the selected format.",
      );
    },
  );

  it("verifies on the network the row had when the dialog opened, whatever the controls say now", async () => {
    const f = fixture();
    const controls = f.native.view.controls;
    controls.network.value = "testnet";
    controls.count.value = "not a number";
    const { request } = await f.verify();
    expect(request.request.network).toBe("mainnet");
  });
});
