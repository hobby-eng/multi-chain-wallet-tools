import { describe, expect, it, vi } from "vitest";
import { WalletCheckDraw, type DrawWork } from "../src/ui/wallet-check-draw.js";
import { drawThreadChoices } from "../src/ui/wallet-check-draw-threads.js";
import type {
  WalletCheckDrawn,
  WalletCheckDrawRequest,
} from "../src/workers/wallet-check-draw-job.js";

/** A fake of one draw worker, the edge of the program: it answers when the test says. */
class FakeWorker {
  readonly requests: WalletCheckDrawRequest[] = [];
  readonly terminate = vi.fn(() => this.#settle({ kind: "stopped" }));
  onProgress: (progress: { draws: number }) => void = () => undefined;
  #settle: (outcome: WalletCheckDrawn | { kind: "stopped" }) => void = () => undefined;
  #fail: (cause: Error) => void = () => undefined;

  run(request: WalletCheckDrawRequest, onProgress: (progress: { draws: number }) => void) {
    this.requests.push(request);
    this.onProgress = onProgress;
    return new Promise<WalletCheckDrawn | { kind: "stopped" }>((resolve, reject) => {
      this.#settle = resolve;
      this.#fail = reject;
    });
  }
  answer(outcome: WalletCheckDrawn): void {
    this.#settle(outcome);
  }
  fail(cause: Error): void {
    this.#fail(cause);
  }
}

type DrawWorker = ReturnType<NonNullable<ConstructorParameters<typeof WalletCheckDraw>[0]>>;

function setup() {
  const workers: FakeWorker[] = [];
  const draw = new WalletCheckDraw(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker as unknown as DrawWorker;
  });
  return { draw, workers };
}

const WORK: DrawWork = {
  wishes: { wordCount: 24, chosen: [], neverUse: [] },
  ton: true,
  threads: 3,
};

describe("the wallet-check draw's threads", () => {
  it("offers one thread up to the threads the browser reports, two or fewer at first", () => {
    expect(drawThreadChoices(8)).toEqual({ counts: [1, 2, 3, 4, 5, 6, 7, 8], preset: 2 });
    expect(drawThreadChoices(1)).toEqual({ counts: [1], preset: 1 });
    // A browser that reports nothing: the default's choices.
    expect(drawThreadChoices(undefined)).toEqual({ counts: [1, 2], preset: 2 });
    expect(drawThreadChoices(0)).toEqual({ counts: [1, 2], preset: 2 });
  });

  it("draws on the threads asked for, adds up their draws and takes the first phrase", async () => {
    const { draw, workers } = setup();
    const tried: number[] = [];
    const phrase = draw.run(WORK, "TREZOR", (draws) => tried.push(draws));
    expect(workers).toHaveLength(3);
    // The first two compute on WebCrypto, which the browser runs on a thread or two of its own;
    // the others in JavaScript, which adds speed with every thread.
    expect(workers.map(({ requests }) => requests[0]?.engine)).toEqual([
      "webcrypto",
      "webcrypto",
      "javascript",
    ]);
    expect(workers[2]!.requests).toEqual([
      { wishes: WORK.wishes, ton: true, passphrase: "TREZOR", engine: "javascript" },
    ]);
    workers[0]!.onProgress({ draws: 100 });
    workers[2]!.onProgress({ draws: 50 });
    workers[1]!.answer({ phrase: "found", draws: 120 });
    await expect(phrase).resolves.toBe("found");
    expect(tried).toEqual([100, 150, 270]);
    for (const worker of workers) expect(worker.terminate).toHaveBeenCalled();
  });

  it("measures the speed of all the threads together, with a public passphrase", async () => {
    const { draw, workers } = setup();
    const speed = draw.measure(WORK, 1000);
    for (const worker of workers)
      expect(worker.requests[0]).toMatchObject({
        passphrase: "speed check",
        measureMilliseconds: 1000,
        ton: true,
      });
    workers[0]!.answer({ measured: { draws: 500, milliseconds: 1000 } });
    workers[1]!.answer({ measured: { draws: 400, milliseconds: 800 } });
    workers[2]!.answer({ measured: { draws: 250, milliseconds: 1000 } });
    // 500 + 500 + 250 draws a second.
    await expect(speed).resolves.toEqual({ drawsPerSecond: 1250 });
  });

  it("gives no speed when stopped, and refuses a measurement a worker failed", async () => {
    const stopped = setup();
    const speed = stopped.draw.measure(WORK, 1000);
    stopped.draw.stop();
    await expect(speed).resolves.toBeUndefined();
    const failed = setup();
    const refused = failed.draw.measure(WORK, 1000);
    // Fault: a worker crashes while the others answer.
    failed.workers[0]!.fail(new Error("The wallet check worker failed."));
    failed.workers[1]!.answer({ measured: { draws: 1, milliseconds: 1000 } });
    failed.workers[2]!.answer({ measured: { draws: 1, milliseconds: 1000 } });
    await expect(refused).rejects.toMatchObject({ code: "wallet.wallet-check-speed.measure" });
  });
});
