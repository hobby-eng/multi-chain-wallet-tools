// The actual receiver and ownership checks run; only the native KDF and worker port are passive.
import { expect, it, vi } from "vitest";
import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { PassiveSlip39 } from "../../../test/support/slip39-passive.js";
import { Slip39RestoreRequest } from "@ckd/recovery-backup/slip39-restore-request.js";
import {
  Slip39WorkerRuntime,
  type Slip39WorkerScope,
} from "../src/workers/slip39-worker-runtime.js";

vi.mock("@noble/hashes/pbkdf2.js", () => ({
  pbkdf2: vi.fn(
    (_h: unknown, _p: Uint8Array, _s: Uint8Array, o: { dkLen: number }) => new Uint8Array(o.dkLen),
  ),
}));

it.each([false, true])(
  "transfers an owned result and cleans inputs when native result delivery refuses=%s",
  (refuse) => {
    using sender = new Slip39RestoreRequest(PassiveSlip39.share(1), "public ASCII fixture");
    const { request, transfer } = sender.take();
    const received = structuredClone(request, { transfer: [...transfer] });
    let output: Uint8Array | undefined;
    let delivered: Uint8Array | undefined;
    const messages: unknown[] = [];
    const scope: Slip39WorkerScope = {
      onmessage: null,
      postMessage(message, transfer = []) {
        messages.push(message);
        if (message.type !== "result") return;
        output = message.outcome;
        if (refuse) throw new Error("Synthetic result transport refusal");
        delivered = structuredClone(message, { transfer }).outcome;
      },
    };
    new Slip39WorkerRuntime(scope);
    expect(messages).toEqual([{ type: "ready" }]);
    const receive = scope.onmessage;
    if (receive === null) throw new Error("Worker receiver was not installed.");
    receive(new MessageEvent("message", { data: received }));
    expect(scope.onmessage).toBeNull();
    expect(received.shares.every((byte) => byte === 0)).toBe(true);
    expect(received.passphrase.every((byte) => byte === 0)).toBe(true);
    if (refuse) {
      expect(output).toHaveLength(16);
      expect(output?.every((byte) => byte === 0)).toBe(true);
      expect(messages.at(-1)).toMatchObject({ type: "error" });
    } else {
      expect(output).toHaveLength(0);
      expect(delivered).toHaveLength(16);
      delivered?.fill(0);
    }
  },
);

it("refuses an unconfirmed exponent-15 wire without starting the KDF", () => {
  vi.mocked(pbkdf2).mockClear();
  using sender = new Slip39RestoreRequest(PassiveSlip39.share(15));
  const { request } = sender.take();
  const post = vi.fn();
  const scope: Slip39WorkerScope = { onmessage: null, postMessage: post };
  new Slip39WorkerRuntime(scope);
  const receive = scope.onmessage;
  if (receive === null) throw new Error("Worker receiver was not installed.");
  receive(new MessageEvent("message", { data: request }));
  expect(post).toHaveBeenLastCalledWith(
    expect.objectContaining({ type: "error", code: "wallet.slip39-restore.consent" }),
  );
  expect(pbkdf2).not.toHaveBeenCalled();
  expect(request.shares.every((byte) => byte === 0)).toBe(true);
});
