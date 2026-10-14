import { describe, expect, it } from "vitest";
import {
  SCANNER_NETWORK_CONCURRENCY,
  SCANNER_ORCHESTRATION_CONCURRENCY,
} from "../src/concurrency-parameters.js";
import { RecoveryConcurrencyLimiter, mapRecoveryTasks } from "../src/concurrency.js";
import { seedLookupEstimate } from "../src/scan-estimate.js";

function select() {
  let options: Array<{ value: string; textContent: string; selected: boolean }> = [];
  const control = {
    ownerDocument: { createElement: () => ({ value: "", textContent: "", selected: false }) },
    replaceChildren: (...items: typeof options) => {
      options = items;
    },
  };
  return { control: control as unknown as HTMLSelectElement, options: () => options };
}

describe("Scanner concurrency policies", () => {
  it("supplies distinct network and orchestration defaults to the actual select population", () => {
    const network = select(),
      orchestration = select();
    SCANNER_NETWORK_CONCURRENCY.populate(network.control);
    SCANNER_ORCHESTRATION_CONCURRENCY.populate(orchestration.control);
    expect(network.options().map((option) => option.value)).toEqual(["1", "2", "3", "4", "5"]);
    expect(orchestration.options().map((option) => option.value)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);
    expect(network.options().find((option) => option.selected)?.value).toBe("5");
    expect(orchestration.options().find((option) => option.selected)?.value).toBe("1");
  });

  it.each([0, 6, 1.5, NaN, Infinity])(
    "refuses %s through parsers, network slots, estimates and task orchestration",
    async (value) => {
      expect(() =>
        SCANNER_NETWORK_CONCURRENCY.parse(String(value), "Network concurrency"),
      ).toThrow();
      expect(() =>
        SCANNER_ORCHESTRATION_CONCURRENCY.parse(String(value), "Batch seed concurrency"),
      ).toThrow();
      expect(() => new RecoveryConcurrencyLimiter(value)).toThrow();
      expect(() => seedLookupEstimate(1, 1, String(value))).toThrow();
      await expect(mapRecoveryTasks([1], value, async (item) => item)).rejects.toThrow();
    },
  );

  it("retains input order when bounded tasks finish in the opposite order", async () => {
    let finish!: () => void;
    const blocked = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const pending = mapRecoveryTasks([1, 2], 2, async (item) => {
      if (item === 1) await blocked;
      else finish();
      return item * 10;
    });
    expect(await pending).toEqual([10, 20]);
  });
});
