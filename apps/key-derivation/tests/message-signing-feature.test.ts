import { afterEach, describe, expect, it, vi } from "vitest";
import { SigningMessage } from "@ckd/core/signing-message.js";
import {
  releaseSigningFixtures,
  settle,
  signingFixture as fixture,
  WorkerBoundary,
} from "./message-signing-fixture.js";

async function pending(f: ReturnType<typeof fixture>) {
  f.sign.click();
  const worker = WorkerBoundary.instances.at(-1);
  if (worker === undefined) throw new Error("The feature did not create its native worker.");
  worker.emit({ type: "ready" });
  await settle();
  const request = worker.requests[0];
  if (request?.type !== "sign-message")
    throw new Error("The client did not post its signing request.");
  return { worker, request };
}

afterEach(releaseSigningFixtures);

describe("the actual message-signing feature owns input revisions through the actual worker client", () => {
  it("refuses a selector value belonging to another coin before starting work", async () => {
    const f = fixture("bitcoin-legacy");
    f.native.page.require("message-signer-format-select").value = "dash-compact";
    f.sign.click();
    await settle();
    expect(WorkerBoundary.instances).toHaveLength(0);
    expect(f.seeds).toHaveLength(0);
    expect(f.native.page.require("message-signer-error").textContent).toBe(
      "Select an offered message-signing format for this address.",
    );
  });

  it("handles native worker construction refusal without reading private factors", async () => {
    const f = fixture();
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          throw new Error("Public fake phrase in native constructor detail");
        }
      },
    );
    f.sign.click();
    await settle();
    expect(f.seeds).toHaveLength(0);
    expect(f.sign.disabled).toBe(false);
    expect(f.native.page.require("message-signer-error").textContent).toBe(
      "Message signing failed.",
    );
  });

  it("clears native text and seed state even if native termination refuses", async () => {
    const f = fixture();
    const { worker } = await pending(f);
    worker.terminate.mockImplementationOnce(() => {
      throw new Error("Public fake phrase in native termination detail");
    });
    f.native.page.require("close-message-signer").click();
    await settle();
    expect(f.message.value).toBe("");
    expect(f.output.value).toBe("");
    expect(f.feature.activeSource()).toBeNull();
    expect(f.seeds[0]).toEqual(new Uint8Array(64));
    expect(f.native.page.require("message-signer-error").textContent).toBe(
      "Message signing failed.",
    );
  });

  it("keeps a replacement request active when the old request settles", async () => {
    const f = fixture();
    const old = await pending(f);
    f.message.value = "Replacement public message";
    f.message.dispatchEvent(new Event("input"));
    const current = await pending(f);
    old.worker.emit({
      id: old.request.id,
      ok: true,
      type: "sign-message",
      result: { signature: "obsolete", format: "BIP-322", verified: true },
    });
    await settle();
    expect(f.sign.disabled).toBe(true);
    expect(f.output.value).toBe("");
    current.worker.emit({
      id: current.request.id,
      ok: true,
      type: "sign-message",
      result: { signature: "replacement", format: "BIP-322", verified: true },
    });
    await settle();
    expect(f.sign.disabled).toBe(false);
    expect(f.output.value).toBe("replacement");
    expect(f.seeds).toHaveLength(2);
    expect(f.seeds.every((seed) => seed.every((byte) => byte === 0))).toBe(true);
  });

  it("rejects oversized text before creating a worker or deriving a seed", async () => {
    const f = fixture();
    f.message.value = "a".repeat(SigningMessage.maxBytes + 1);
    expect(f.native.page.require("message-signer-message-help").textContent).toBe(
      SigningMessage.help,
    );
    f.sign.click();
    await settle();
    expect(WorkerBoundary.instances).toHaveLength(0);
    expect(f.seeds).toHaveLength(0);
    expect(f.native.page.require("message-signer-error").textContent).toContain("64 KiB");
  });

  it.each(["message", "format", "pagehide"])(
    "retires a pending result after %s changes",
    async (change) => {
      const f = fixture("bitcoin-legacy");
      const { worker, request } = await pending(f);
      if (change === "message") {
        f.message.value = "Replacement public message";
        f.message.dispatchEvent(new Event("input"));
      }
      if (change === "format") {
        const format = f.native.page.require("message-signer-format-select");
        format.value = "bitcoin-compact";
        format.dispatchEvent(new Event("change"));
      }
      if (change === "pagehide") f.native.page.window.dispatchEvent(new Event("pagehide"));
      worker.emit({
        id: request.id,
        ok: true,
        type: "sign-message",
        result: { signature: "stale public signature", format: "BIP-322", verified: true },
      });
      await settle();
      expect(f.output.value).toBe("");
      expect(f.native.page.require("message-signature-result").hidden).toBe(true);
      expect(f.seeds).toHaveLength(1);
      expect(f.seeds[0]).toEqual(new Uint8Array(64));
    },
  );

  it("redacts an unrecognized worker failure", async () => {
    const f = fixture();
    const { worker, request } = await pending(f);
    worker.emit({
      id: request.id,
      ok: false,
      error: "Public fake phrase in unknown worker detail",
      errorCode: "UNRECOGNIZED",
    });
    await settle();
    expect(f.native.page.require("message-signer-error").textContent).toBe(
      "Message signing failed.",
    );
    expect(f.seeds[0]).toEqual(new Uint8Array(64));
  });

  it("publishes a verified response for the current request", async () => {
    const f = fixture();
    const { worker, request } = await pending(f);
    worker.emit({
      id: request.id,
      ok: true,
      type: "sign-message",
      result: { signature: "current public signature", format: "BIP-322", verified: true },
    });
    await settle();
    expect(f.output.value).toBe("current public signature");
    expect(f.native.page.require("message-signature-result").hidden).toBe(false);
    expect(f.seeds[0]).toEqual(new Uint8Array(64));
  });
});
