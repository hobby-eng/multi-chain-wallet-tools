import { vi } from "vitest";

/** Passive native worker surface for shared recovery-client lifecycle controls. */
export class FakeRecoveryWorker extends EventTarget {
  static latest: FakeRecoveryWorker;
  onmessage: ((event: { data: unknown }) => void) | undefined;
  onerror: ((event: { preventDefault(): void }) => void) | undefined;
  readonly postMessage = vi.fn();
  readonly terminate = vi.fn();

  constructor() {
    super();
    FakeRecoveryWorker.latest = this;
  }

  reply(data: unknown): void {
    this.onmessage?.({ data });
    this.dispatchEvent(new MessageEvent("message", { data }));
  }
}
