import { afterEach, expect, it, vi } from "vitest";
import { getRuntimeCoinAdapter } from "@ckd/coins/runtime-registry.js";
import { runDerivationSelfTest } from "@ckd/derivation-self-test";
import { clearDerivationResult } from "@ckd/core/secrets.js";
import type { DerivationResult, ResultField } from "@ckd/core/types.js";
import { startDerivationWorker } from "../src/workers/worker-runtime.js";
import { MessageSigners } from "@ckd/coins/message-signing.js";
import { BITCOIN_MESSAGE_SIGNING } from "@ckd/coins/bitcoin/message-signing.js";
import { DASH_MESSAGE_SIGNING } from "@ckd/coins/dash/message-signing.js";
import { DerivationResultFixture } from "@ckd/test-support/derivation-result.js";
import type { CoinDerivationInput } from "@ckd/coins/registry-base.js";
import type { WorkerMessage, WorkerRequest } from "../src/workers/protocol.js";

afterEach(() => vi.unstubAllGlobals());

const signers = new MessageSigners([BITCOIN_MESSAGE_SIGNING, DASH_MESSAGE_SIGNING]);

it.each([
  { adapterId: "bitcoin-legacy", format: "bitcoin-compact" },
  { adapterId: "dash-core", format: "dash-compact" },
] as const)(
  "owns $adapterId fields before lending them to an asynchronous signing consumer",
  async ({ adapterId, format }) => {
    const input = {
      seed: new Uint8Array(64).fill(1),
      network: "mainnet" as const,
      account: 0,
      branch: 0,
      start: 0,
      count: 1,
    };
    const arranged = await getRuntimeCoinAdapter(adapterId).derive(input);
    const address = arranged.rows[0]!.basic.find((field) => field.key === "address")!.value;
    clearDerivationResult(arranged);
    let listener: ((event: MessageEvent<WorkerRequest>) => void) | undefined;
    let finish!: () => void;
    const pause = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let entered = false;
    let retiredWriteRefused = false;
    let privateFieldsLoaned = false;
    let observedPrivateField: ResultField | undefined;
    const messages: WorkerMessage[] = [];
    vi.stubGlobal("self", {
      addEventListener(_type: string, callback: typeof listener) {
        listener = callback;
      },
      postMessage(message: WorkerMessage) {
        messages.push(structuredClone(message));
      },
    });
    startDerivationWorker({
      getRuntimeCoinAdapter: (id) => {
        const actual = getRuntimeCoinAdapter(id);
        return {
          ...actual,
          derive: async (request: CoinDerivationInput) => {
            const result = await actual.derive(request);
            // A call-through observer keeps this public fixture's reference, never substitutes derivation.
            observedPrivateField = result.rows[0]?.advanced.find((field) => field.secret);
            return result;
          },
        };
      },
      runDerivationSelfTest,
      admitMessageSigning: signers.admit,
      signDerivedMessage: async (...args) => {
        privateFieldsLoaned = args[2].some((field) => field.secret);
        const privateField = observedPrivateField;
        if (privateField === undefined)
          throw new Error("The actual adapter must expose this fixture's private field.");
        const carrier = DerivationResultFixture.create();
        carrier.rows[0]!.advanced = [privateField];
        clearDerivationResult(carrier);
        try {
          privateField.value = "synthetic late private value";
        } catch (cause) {
          retiredWriteRefused =
            cause instanceof Error && "code" in cause && cause.code === "derivation.result.retired";
        }
        entered = true;
        await pause;
        // Real signing still runs; the paused adapter observes lifetime at its supplied operation port.
        return signers.sign(...args);
      },
    });
    listener?.(
      new MessageEvent<WorkerRequest>("message", {
        data: {
          id: 1,
          type: "sign-message",
          adapterId,
          input,
          address,
          addressKey: "address",
          message: "Synthetic public signing fixture",
          format,
        },
      }),
    );
    try {
      await vi.waitFor(() => expect(entered).toBe(true));
    } finally {
      finish();
    }
    await vi.waitFor(() => expect(messages.some((message) => "id" in message)).toBe(true));
    expect(messages.find((message) => "id" in message)).toHaveProperty("ok", true);
    expect(input.seed.every((byte) => byte === 0)).toBe(true);
    expect(retiredWriteRefused).toBe(true);
    expect(privateFieldsLoaned).toBe(false);
  },
);

it.each([false, true])(
  "retires actual worker result material after native post failure=%s",
  async (fail) => {
    let listener: ((event: MessageEvent<WorkerRequest>) => void) | undefined;
    let borrowed: DerivationResult | undefined;
    let borrowedFields: ResultField[] = [];
    const messages: WorkerMessage[] = [];
    vi.stubGlobal("self", {
      addEventListener(_type: string, callback: typeof listener) {
        listener = callback;
      },
      postMessage(message: WorkerMessage) {
        if ("ok" in message && message.ok && message.type === "derive") {
          borrowed = message.result;
          borrowedFields = [
            ...message.result.basicSummary,
            ...message.result.summary,
            ...message.result.rows.flatMap((row) => [...row.basic, ...row.advanced]),
          ].filter((field) => field.secret);
          if (fail) throw new Error("Synthetic native post refusal.");
        }
        // Exercise the actual native structured-clone algorithm; the receiver owns its copy.
        messages.push(structuredClone(message));
      },
    });
    startDerivationWorker({ getRuntimeCoinAdapter, runDerivationSelfTest });
    const seed = new Uint8Array(64).fill(1);
    const request: WorkerRequest = {
      id: 1,
      type: "derive",
      adapterId: "bitcoin-legacy",
      input: { seed, network: "mainnet", account: 0, branch: 0, start: 0, count: 1 },
    };
    listener?.(new MessageEvent("message", { data: request }));
    await vi.waitFor(() =>
      expect(messages.some((message) => "id" in message && message.id === 1)).toBe(true),
    );
    expect(seed.every((byte) => byte === 0)).toBe(true);
    expect(borrowed).toBeDefined();
    expect(borrowed?.rows).toHaveLength(0);
    expect(borrowed?.summary).toHaveLength(0);
    expect(borrowedFields.length).toBeGreaterThan(0);
    expect(borrowedFields.every((field) => field.value === "")).toBe(true);
    const reply = messages.find((message) => "id" in message && message.id === 1)!;
    expect(reply).toHaveProperty("ok", !fail);
    if ("ok" in reply && reply.ok && reply.type === "derive") {
      try {
        expect(reply.result.rows).toHaveLength(1);
        const privateFields = reply.result.summary.filter((field) => field.secret);
        expect(privateFields.length).toBeGreaterThan(0);
        expect(privateFields.every((field) => field.value.length > 0)).toBe(true);
      } finally {
        clearDerivationResult(reply.result);
      }
    }
  },
);

/** Starts a worker runtime on a recording `self` and sends it one verify-message request. */
async function verifyInWorker(
  dependencies: Omit<Parameters<typeof startDerivationWorker>[0], "runDerivationSelfTest">,
  message: string,
) {
  let listener: ((event: MessageEvent<WorkerRequest>) => void) | undefined;
  const messages: WorkerMessage[] = [];
  vi.stubGlobal("self", {
    addEventListener(_type: string, callback: typeof listener) {
      listener = callback;
    },
    postMessage(posted: WorkerMessage) {
      messages.push(structuredClone(posted));
    },
  });
  startDerivationWorker({ ...dependencies, runDerivationSelfTest });
  // The Dash self-test's public key-1 answer (message-signer-self-test-dash.ts).
  const request = {
    format: "dash-compact",
    address: "XmN7PQYWKn5MJFna5fRYgP6mxT2F7xpekE",
    message,
    network: "mainnet",
  } as const;
  const signature =
    "H5Oj4LXfIgqbHRLIbCGux6wQGf3ZtC8iQt79foa4M9nkadAXIRsCL4X8sJWAH9iwOpV5w6N8mS1jxrRp+8Nxapc=";
  listener?.(
    new MessageEvent("message", {
      data: { id: 1, type: "verify-message", adapterId: "dash-core", request, signature },
    }),
  );
  await vi.waitFor(() => expect(messages.some((posted) => "id" in posted)).toBe(true));
  return messages.find((posted) => "id" in posted);
}

it.each([
  ["Offline message signing self-test", true],
  ["Another message", false],
])(
  "verifies %j to %s from public material, without an adapter or a derivation",
  async (message, valid) => {
    const getRuntimeCoinAdapter = vi.fn(() => {
      throw new Error("Verification must not reach a coin adapter.");
    });
    const verifyDerivedMessage = vi.fn(signers.verify);
    const reply = await verifyInWorker(
      { getRuntimeCoinAdapter, verifyDerivedMessage, admitMessageSigning: signers.admit },
      message,
    );
    expect(reply).toEqual({ id: 1, ok: true, type: "verify-message", result: valid });
    expect(verifyDerivedMessage).toHaveBeenCalledOnce();
    expect(getRuntimeCoinAdapter).not.toHaveBeenCalled();
  },
);

it("refuses verification in a build that composed no verifier", async () => {
  const reply = await verifyInWorker({ getRuntimeCoinAdapter }, "public message");
  expect(reply).toMatchObject({
    id: 1,
    ok: false,
    error: "Message verification is unavailable in this build profile.",
  });
});
