import { combinedSelfTest } from "@ckd/verification/helpers.js";
import type { RuntimeCoinAdapter } from "@ckd/coins/runtime-registry.js";
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import { hexToBytes, wipe } from "@ckd/core/crypto.js";
import { clearDerivationResult } from "@ckd/core/secrets.js";
import { findDerivedAddress, findDerivedAddresses } from "@ckd/recovery/address-search.js";
import type { WorkerMessage, WorkerRequest } from "./protocol.js";
import type { SilentPaymentResult } from "./silent-payment.js";
import type { Bip85RequestOptions, Bip85Result } from "./bip85-deriver.js";
import type { MessageSigningFormat } from "./protocol.js";
import type { ResultField } from "@ckd/core/types.js";

interface WorkerScope {
  addEventListener(type: "message", listener: (event: MessageEvent<WorkerRequest>) => void): void;
  postMessage(message: WorkerMessage): void;
}

/**
 * The functions of the optional features that the build composed (the Bitcoin or the Dash-only
 * signer, for example); a feature's known-answer check runs through them, so that it checks the
 * code the worker actually uses.
 */
export type FeatureFunctions = Pick<
  WorkerDependencies,
  "signDerivedMessage" | "encryptDerivedP2pkhKey"
>;

/** A known-answer check of an optional feature of the build. */
type FeatureSelfTest = (
  features: FeatureFunctions,
) => Promise<CryptoSelfTestReport> | CryptoSelfTestReport;

interface WorkerDependencies {
  getRuntimeCoinAdapter(id: string): RuntimeCoinAdapter;
  runDerivationSelfTest(): Promise<CryptoSelfTestReport>;
  /** The quick checks of the optional features built in, run at every startup. */
  startupSelfTests?: readonly FeatureSelfTest[];
  /** The slower checks of those features, run only in the full self-test. */
  fullSelfTests?: readonly FeatureSelfTest[];
  signDerivedMessage?(
    privateKeyHex: string,
    address: string,
    message: string,
    network: "mainnet" | "testnet",
    format: MessageSigningFormat,
    fields: readonly ResultField[],
  ):
    | Promise<{ signature: string; format: string; verified: boolean }>
    | {
        signature: string;
        format: string;
        verified: boolean;
      };
  deriveSilentPayment?(
    seed: Uint8Array,
    network: "mainnet" | "testnet",
    account: number,
    labelIndexes?: readonly number[],
  ): Promise<SilentPaymentResult>;
  deriveBip85?(seed: Uint8Array, options: Bip85RequestOptions): Bip85Result;
  encryptDerivedP2pkhKey?(
    privateKey: Uint8Array,
    adapterId: string,
    network: "mainnet" | "testnet",
    passphrase: string,
  ): Promise<{ encryptedKey: string; address: string }>;
}

/** The derivation checks, then each feature's, one at a time: one report for all of them. */
async function runSelfTests(
  dependencies: WorkerDependencies,
  full: boolean,
): Promise<CryptoSelfTestReport> {
  const features = [
    ...(dependencies.startupSelfTests ?? []),
    ...(full ? (dependencies.fullSelfTests ?? []) : []),
  ];
  return combinedSelfTest([
    dependencies.runDerivationSelfTest,
    ...features.map((run) => () => run(dependencies)),
  ]);
}

/** The private key of one derived row, lent to an operation that needs it. */
interface DerivedPrivateKey {
  readonly hex: string;
  readonly bytes: Uint8Array;
  /** Every field of the row, for an operation that names the key's type. */
  readonly fields: ResultField[];
}

/**
 * Derives the one row at `input.start`, checks that its address is still `address`, and lends its
 * private key to `use`; the key and the row are wiped afterwards, whatever `use` does.
 * `unsupported` refuses a mode that shows no private key.
 */
async function withDerivedPrivateKey<T>(
  adapter: RuntimeCoinAdapter,
  input: Parameters<RuntimeCoinAdapter["derive"]>[0],
  address: string,
  unsupported: string,
  use: (key: DerivedPrivateKey) => T | Promise<T>,
): Promise<T> {
  const result = await adapter.derive({ ...input, start: input.start, count: 1 });
  let privateKey: Uint8Array | null = null;
  try {
    const row = result.rows[0];
    const derivedAddress = row?.basic.find((field) => field.key === "address")?.value;
    const fields = row === undefined ? [] : [...row.basic, ...row.advanced];
    const privateKeyHex = fields.find(
      (field) => field.key === "privateKeyHex" || field.key === "childPrivateKey",
    )?.value;
    if (derivedAddress !== address)
      throw new Error("The selected address no longer matches the requested derivation path.");
    if (privateKeyHex === undefined) throw new Error(unsupported);
    privateKey = hexToBytes(privateKeyHex);
    return await use({ hex: privateKeyHex, bytes: privateKey, fields });
  } finally {
    wipe(privateKey);
    clearDerivationResult(result);
  }
}

export function startDerivationWorker(dependencies: WorkerDependencies): void {
  const workerScope = self as unknown as WorkerScope;
  workerScope.postMessage({ type: "ready" });

  workerScope.addEventListener("message", (event) => {
    const request = event.data;
    void (async () => {
      try {
        if (request.type === "self-test") {
          const result = await runSelfTests(dependencies, request.full === true);
          workerScope.postMessage({ id: request.id, ok: true, type: "self-test", result });
          return;
        }
        if (request.type === "silent-payment") {
          try {
            if (dependencies.deriveSilentPayment === undefined) {
              throw new Error(
                "The requested payment protocol is unavailable in this build profile.",
              );
            }
            const result = await dependencies.deriveSilentPayment(
              request.seed,
              request.network,
              request.account,
              request.labelIndexes,
            );
            workerScope.postMessage({ id: request.id, ok: true, type: "silent-payment", result });
          } finally {
            request.seed.fill(0);
          }
          return;
        }
        if (request.type === "bip85") {
          try {
            if (dependencies.deriveBip85 === undefined)
              throw new Error("BIP85 is unavailable in this build profile.");
            const result = dependencies.deriveBip85(request.seed, request.options);
            workerScope.postMessage({ id: request.id, ok: true, type: "bip85", result });
          } finally {
            request.seed.fill(0);
          }
          return;
        }
        try {
          const adapter = dependencies.getRuntimeCoinAdapter(request.adapterId);
          if (request.type === "search") {
            const result = await findDerivedAddress(
              adapter,
              request.input,
              request.expectedAddress,
              request.start,
              request.count,
              undefined,
            );
            workerScope.postMessage({ id: request.id, ok: true, type: "search", result });
            return;
          }
          if (request.type === "search-many") {
            const result = await findDerivedAddresses(
              adapter,
              request.input,
              request.requests,
              request.start,
              request.count,
              undefined,
            );
            workerScope.postMessage({ id: request.id, ok: true, type: "search-many", result });
            return;
          }
          if (request.type === "sign-message") {
            const sign = dependencies.signDerivedMessage;
            if (sign === undefined)
              throw new Error("Message signing is unavailable in this build profile.");
            const signed = await withDerivedPrivateKey(
              adapter,
              request.input,
              request.address,
              "This derivation mode does not expose a compatible private key for message signing.",
              (key) =>
                sign(
                  key.hex,
                  request.address,
                  request.message,
                  request.input.network,
                  request.format,
                  key.fields,
                ),
            );
            workerScope.postMessage({
              id: request.id,
              ok: true,
              type: "sign-message",
              result: signed,
            });
            return;
          }
          if (request.type === "bip38-encrypt") {
            const encrypt = dependencies.encryptDerivedP2pkhKey;
            if (encrypt === undefined)
              throw new Error("Private-key encryption is unavailable in this build profile.");
            const encrypted = await withDerivedPrivateKey(
              adapter,
              request.input,
              request.address,
              "This derivation mode does not expose a compatible private key.",
              (key) =>
                encrypt(key.bytes, request.adapterId, request.input.network, request.passphrase),
            );
            workerScope.postMessage({
              id: request.id,
              ok: true,
              type: "bip38-encrypt",
              result: encrypted,
            });
            return;
          }
          const result = await adapter.derive(request.input);
          workerScope.postMessage({ id: request.id, ok: true, type: "derive", result });
        } finally {
          request.input.seed.fill(0);
        }
      } catch (cause) {
        workerScope.postMessage({
          id: request.id,
          ok: false,
          error: cause instanceof Error ? cause.message : String(cause),
        });
      }
    })();
  });
}
