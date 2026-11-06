// Actual parser and published invalid-padding fixtures; no KDF or reconstruction is run.
import { afterEach, expect, it, vi } from "vitest";
import { Slip39 } from "../src/slip39.js";
import vectors from "./slip39-official-vectors.json";

const NativeBytes = Uint8Array;
afterEach(() => vi.unstubAllGlobals());

function observeAllocations(): Uint8Array[] {
  const allocations: Uint8Array[] = [];
  vi.stubGlobal(
    "Uint8Array",
    new Proxy(NativeBytes, {
      construct(target, argumentsList: unknown[], newTarget) {
        const bytes: unknown = Reflect.construct(target, argumentsList, newTarget);
        if (!(bytes instanceof NativeBytes))
          throw new Error("The native byte constructor refused.");
        allocations.push(bytes);
        return bytes;
      },
    }),
  );
  return allocations;
}

const cases = vectors.flatMap(([description, shares]) => {
  if (typeof description !== "string" || !description.toLowerCase().includes("invalid padding"))
    return [];
  if (!Array.isArray(shares)) throw new Error("Published padding fixture has no share list.");
  return [{ description, shares }];
});

it.each(cases)("does not allocate discarded share bytes: $description", ({ shares }) => {
  expect(cases).toHaveLength(2);
  const allocated = observeAllocations();
  for (const share of shares) expect(() => Slip39.parse(share)).toThrow(/padding/iu);
  expect(allocated).toEqual([]);
});

it("observes a healthy parse allocation and its disposal", () => {
  const shares = vectors[0]?.[1];
  if (!Array.isArray(shares) || shares[0] === undefined)
    throw new Error("The published healthy share is missing.");
  const allocated = observeAllocations();
  using share = Slip39.parse(shares[0]);
  expect(allocated).toContain(share.value);
  share.wipe();
  expect(allocated.every((bytes) => bytes.every((byte) => byte === 0))).toBe(true);
});
