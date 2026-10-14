import { describe, expect, it } from "vitest";
import { MAX_BIP32_INDEX } from "@ckd/core/bip32-limits.js";
import { findDerivedAddress } from "../src/address-search.js";
import { searchAcrossAddresses } from "../src/multi-address-search.js";
import { searchAcrossSeedsAndAddresses } from "../src/multi-seed-search.js";
import { LocalSearchAdmission, MAX_LOCAL_SEARCH_COUNT } from "../src/local-search-admission.js";
import type { AddressSearchTarget } from "../src/address-targets.js";
import type { RuntimeCoinAdapter } from "@ckd/coins/runtime-types.js";

const target = (input: string): AddressSearchTarget => ({
  input,
  normalized: input,
  adapterId: "bitcoin-legacy",
  network: "mainnet",
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const INVALID_CONCURRENCY = [NaN, Infinity, -Infinity, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1];

describe("local search admission and result completeness", () => {
  it.each(INVALID_CONCURRENCY)(
    "rejects concurrency %s before either entry point invokes a job",
    async (concurrency) => {
      let calls = 0;
      const options = {
        targets: [target("one")],
        start: 0,
        count: 1,
        concurrency,
        search: async () => {
          calls += 1;
          return null;
        },
      };
      await expect(searchAcrossAddresses(options)).rejects.toThrow(/concurrency/u);
      const seed = new Uint8Array([7]);
      await expect(
        searchAcrossSeedsAndAddresses({
          ...options,
          seeds: [{ id: "synthetic", label: "Synthetic", seed }],
        }),
      ).rejects.toThrow(/concurrency/u);
      expect(calls).toBe(0);
      expect([...seed]).toEqual([0]);
    },
  );

  it.each([undefined, 1, 2, 5, Number.MAX_SAFE_INTEGER])(
    "executes every job without sparse slots at concurrency %s",
    async (concurrency) => {
      const targets = [target("one"), target("two"), target("three")];
      const options = { targets, start: 0, count: 1, concurrency };
      let calls = 0;
      const addresses = await searchAcrossAddresses({
        ...options,
        search: async () => {
          calls += 1;
          return null;
        },
      });
      expect(calls).toBe(targets.length);
      expect(addresses.filter(() => true)).toHaveLength(targets.length);
      expect(addresses.map((result) => result.target.input)).toEqual(["one", "two", "three"]);
      calls = 0;
      const seeds = [
        { id: "a", label: "A", seed: new Uint8Array([1]) },
        { id: "b", label: "B", seed: new Uint8Array([2]) },
      ];
      const matrix = await searchAcrossSeedsAndAddresses({
        ...options,
        seeds,
        search: async () => {
          calls += 1;
          return null;
        },
      });
      expect(calls).toBe(6);
      expect(matrix.filter(() => true)).toHaveLength(6);
      expect(matrix.map((result) => `${result.seedId}:${result.target.input}`)).toEqual([
        "a:one",
        "a:two",
        "a:three",
        "b:one",
        "b:two",
        "b:three",
      ]);
    },
  );

  it("reports completion order while returning input order and isolated failures", async () => {
    const first = deferred();
    const later = deferred();
    const progress: Array<[number, number]> = [];
    const run = searchAcrossSeedsAndAddresses({
      seeds: [{ id: "synthetic", label: "Synthetic", seed: new Uint8Array([1]) }],
      targets: [target("first"), target("second"), target("failed")],
      start: 0,
      count: 1,
      concurrency: 2,
      search: async (_seed, _id, address) => {
        if (address.input === "first") await first.promise;
        if (address.input === "failed") throw new Error("isolated failure");
        return null;
      },
      onProgress: (completed, _total, _result, index) => {
        progress.push([completed, index]);
        if (completed === 2) later.resolve();
      },
    });
    await later.promise;
    first.resolve();
    const results = await run;
    expect(progress).toEqual([
      [1, 1],
      [2, 2],
      [3, 0],
    ]);
    expect(results.map((result) => result.target.input)).toEqual(["first", "second", "failed"]);
    expect(results[2]?.error).toBe("isolated failure");
    expect(results.filter(() => true)).toHaveLength(3);
  });

  it("does not publish the final result when its callback aborts the search", async () => {
    const controller = new AbortController();
    const progress: number[] = [];
    await expect(
      searchAcrossAddresses({
        targets: [target("last")],
        start: 0,
        count: 1,
        signal: controller.signal,
        search: async () => {
          controller.abort();
          return null;
        },
        onProgress: (completed) => progress.push(completed),
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(progress).toEqual([]);
  });

  it("drains active seed jobs before cancellation cleanup and admits no later job", async () => {
    const controller = new AbortController();
    const first = deferred();
    const second = deferred();
    const firstReturned = deferred();
    const seed = new Uint8Array([7]);
    const started: string[] = [];
    const progress: number[] = [];
    let secondRead = 0;
    let settled = false;
    const run = searchAcrossSeedsAndAddresses({
      seeds: [{ id: "synthetic", label: "Synthetic", seed }],
      targets: [target("first"), target("second"), target("unstarted")],
      start: 0,
      count: 1,
      concurrency: 2,
      signal: controller.signal,
      search: async (bytes, _id, address) => {
        started.push(address.input);
        if (address.input === "first") {
          await first.promise;
          firstReturned.resolve();
        } else {
          await second.promise;
          secondRead = bytes[0]!;
        }
        return null;
      },
      onProgress: (completed) => progress.push(completed),
    });
    const observed = run.then(
      () => {
        settled = true;
        return null;
      },
      (cause: unknown) => {
        settled = true;
        return cause;
      },
    );
    controller.abort();
    first.resolve();
    await firstReturned.promise;
    await Promise.resolve();
    expect(settled).toBe(false);
    expect([...seed]).toEqual([7]);
    second.resolve();
    expect(await observed).toMatchObject({ name: "AbortError" });
    expect(secondRead).toBe(7);
    expect([...seed]).toEqual([0]);
    expect(started).toEqual(["first", "second"]);
    expect(progress).toEqual([]);
  });

  it("rejects a pre-aborted empty run", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      searchAcrossAddresses({
        targets: [],
        start: 0,
        count: 1,
        signal: controller.signal,
        search: async () => null,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("shared local search range admission", () => {
  it("accepts exact BIP32 and custom uint32 boundaries", () => {
    expect(() => LocalSearchAdmission.range(MAX_BIP32_INDEX, 1)).not.toThrow();
    expect(() => LocalSearchAdmission.range(MAX_BIP32_INDEX - 1, 2)).not.toThrow();
    expect(() => LocalSearchAdmission.range(0, MAX_LOCAL_SEARCH_COUNT)).not.toThrow();
    expect(() => LocalSearchAdmission.range(0xffff_ffff, 1, 0xffff_ffff)).not.toThrow();
    expect(() => LocalSearchAdmission.range(0xffff_ffff, 2, 0xffff_ffff)).toThrow(/range/u);
  });

  it.each([NaN, Infinity, -1])("refuses invalid maximum index %s", (maximum) => {
    expect(() => LocalSearchAdmission.range(0, 1, maximum)).toThrow(/maximum index/u);
  });

  it.each([
    [NaN, 1],
    [-1, 1],
    [0.5, 1],
    [0, NaN],
    [0, Infinity],
    [0, 0],
    [0, 1.5],
    [0, MAX_LOCAL_SEARCH_COUNT + 1],
    [MAX_BIP32_INDEX, 2],
  ])("rejects invalid range %s/%s before deriving or searching", async (start, count) => {
    let calls = 0;
    const search = async () => {
      calls += 1;
      return null;
    };
    await expect(
      searchAcrossAddresses({ targets: [target("one")], start, count, search }),
    ).rejects.toThrow(/Search|range/u);
    const seed = new Uint8Array([7]);
    await expect(
      searchAcrossSeedsAndAddresses({
        seeds: [{ id: "synthetic", label: "Synthetic", seed }],
        targets: [target("one")],
        start,
        count,
        search,
      }),
    ).rejects.toThrow(/Search|range/u);
    const adapter = { derive: search } as unknown as RuntimeCoinAdapter;
    await expect(
      findDerivedAddress(
        adapter,
        { seed, network: "mainnet", account: 0, branch: 0 },
        "synthetic",
        start,
        count,
      ),
    ).rejects.toThrow(/Search|range/u);
    expect(calls).toBe(0);
    expect([...seed]).toEqual([0]);
  });
});
