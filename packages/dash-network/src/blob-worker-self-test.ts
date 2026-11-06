import { EmbeddedWorkerResource } from "@ckd/ui/embedded-worker-resource.js";

const TIMEOUT_MS = 3_000;
const TOKEN = "dash-key-tools-blob-worker-ok";
const SOURCE = `self.onmessage=function(event){if(event.data===${JSON.stringify(TOKEN)})self.postMessage(event.data);};`;
const REFUSALS = {
  INVALID_TIMEOUT: `The Blob Worker check needs a whole-number timeout from 1 to ${TIMEOUT_MS} milliseconds.`,
  UNAVAILABLE: "This browser does not expose Web Workers.",
  TIMEOUT: "Blob Worker startup timed out.",
  UNEXPECTED_RESPONSE: "Blob Worker returned an unexpected self-test response.",
  EXECUTION_BLOCKED: "Blob Worker execution was blocked.",
  NATIVE_FAILED: "The Blob Worker runtime check failed.",
} as const;

/** Input-free failures of the real Blob Worker startup check. */
export class BlobWorkerSelfTestError extends Error {
  readonly code: keyof typeof REFUSALS;

  constructor(code: keyof typeof REFUSALS) {
    super(REFUSALS[code]);
    this.name = "BlobWorkerSelfTestError";
    this.code = code;
  }
}

/** Owns the bounded response check; EmbeddedWorkerResource owns its worker and script URL. */
export class BlobWorkerSelfTest {
  readonly #timeoutMs: number;

  constructor(timeoutMs = TIMEOUT_MS) {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > TIMEOUT_MS)
      throw new BlobWorkerSelfTestError("INVALID_TIMEOUT");
    this.#timeoutMs = timeoutMs;
  }

  /** Executes the actual same-document Blob Worker; returns rounded elapsed milliseconds. */
  async run(): Promise<number> {
    const startedAt = performance.now();
    if (typeof Worker !== "function") throw new BlobWorkerSelfTestError("UNAVAILABLE");
    let resource: EmbeddedWorkerResource | undefined;
    let deadline: ReturnType<typeof globalThis.setTimeout> | undefined;
    const events = new AbortController();
    try {
      try {
        await new Promise<void>((resolve, reject) => {
          const active = new EmbeddedWorkerResource(
            [SOURCE],
            { name: "dash-key-tools-runtime-check" },
            (failure) =>
              reject(
                new BlobWorkerSelfTestError(failure === undefined ? "TIMEOUT" : "NATIVE_FAILED"),
              ),
          );
          resource = active;
          deadline = globalThis.setTimeout(
            () => reject(new BlobWorkerSelfTestError("TIMEOUT")),
            this.#timeoutMs,
          );
          active.worker.addEventListener(
            "message",
            (event: MessageEvent<unknown>) => {
              try {
                active.loaded();
                if (event.data === TOKEN) resolve();
                else reject(new BlobWorkerSelfTestError("UNEXPECTED_RESPONSE"));
              } catch {
                reject(new BlobWorkerSelfTestError("NATIVE_FAILED"));
              }
            },
            { once: true, signal: events.signal },
          );
          active.worker.addEventListener(
            "error",
            () => {
              reject(new BlobWorkerSelfTestError("EXECUTION_BLOCKED"));
            },
            { once: true, signal: events.signal },
          );
          active.worker.postMessage(TOKEN);
        });
      } finally {
        try {
          if (deadline !== undefined) globalThis.clearTimeout(deadline);
        } finally {
          try {
            events.abort();
          } finally {
            resource?.dispose();
          }
        }
      }
    } catch (cause) {
      if (cause instanceof BlobWorkerSelfTestError) throw cause;
      throw new BlobWorkerSelfTestError("NATIVE_FAILED");
    }
    return Math.round(performance.now() - startedAt);
  }
}

/** Compatibility entry; bounded milliseconds, with cleanup attempted on every path. */
export async function runBlobWorkerSelfTest(timeoutMs = TIMEOUT_MS): Promise<number> {
  return new BlobWorkerSelfTest(timeoutMs).run();
}
