import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmbeddedWorkerResource } from "../src/embedded-worker-resource.js";

const URL_VALUE = "blob:public-test-worker";
const worker = { terminate: vi.fn() };

beforeEach(() => {
  vi.useFakeTimers();
  worker.terminate.mockReset();
  vi.stubGlobal(
    "Worker",
    class {
      constructor() {
        return worker;
      }
    },
  );
  vi.spyOn(URL, "createObjectURL").mockReturnValue(URL_VALUE);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("embedded worker resource ownership", () => {
  it("releases the allocated URL if worker construction fails", () => {
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          throw new Error("synthetic startup failure");
        }
      },
    );
    expect(() => new EmbeddedWorkerResource(["public test source"], {}, vi.fn())).toThrow(
      "synthetic startup failure",
    );
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith(URL_VALUE);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the URL until loaded, then disposes the worker exactly once", () => {
    const timeout = vi.fn();
    const resource = new EmbeddedWorkerResource(["public test source"], {}, timeout);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    resource.loaded();
    resource.loaded();
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith(URL_VALUE);
    expect(vi.getTimerCount()).toBe(0);
    expect(worker.terminate).not.toHaveBeenCalled();
    resource.dispose();
    resource.dispose();
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(timeout).not.toHaveBeenCalled();
  });

  it("bounds deferred cancellation even if the worker never reports ready", () => {
    const timeout = vi.fn();
    const resource = new EmbeddedWorkerResource(["public test source"], {}, timeout);
    resource.dispose(true);
    expect(worker.terminate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(15_000);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith(URL_VALUE);
    expect(timeout).toHaveBeenCalledOnce();
    resource.loaded();
    resource.dispose();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("ends a deferred cancellation when the script loads", () => {
    const timeout = vi.fn();
    const resource = new EmbeddedWorkerResource(["public test source"], {}, timeout);
    resource.dispose(true);
    resource.loaded();
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith(URL_VALUE);
    vi.advanceTimersByTime(15_000);
    expect(timeout).not.toHaveBeenCalled();
  });

  it("releases the URL even when termination fails", () => {
    worker.terminate.mockImplementationOnce(() => {
      throw new Error("synthetic termination failure");
    });
    const resource = new EmbeddedWorkerResource(["public test source"], {}, vi.fn());
    expect(() => resource.dispose()).toThrow("synthetic termination failure");
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith(URL_VALUE);
    expect(vi.getTimerCount()).toBe(0);
    resource.dispose();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
