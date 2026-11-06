import { afterEach, expect, it } from "vitest";
import { latestShares } from "../src/ui/recovery-mnemocode-share-store.js";

afterEach(() => {
  latestShares.shares = undefined;
});

it("ends the retained share-set lifetime through disposal without changing its temporary text views", () => {
  const records = ["\uFEFFsynthetic share\r\n\ud800"];
  latestShares.shares = { records, form: "words", masked: false, origin: "split" };
  records[0] = "synthetic changed caller array";
  expect(latestShares.shares?.records).toEqual(["\uFEFFsynthetic share\r\n\ud800"]);
  latestShares.forget("repair");
  expect(latestShares.shares?.origin).toBe("split");
  const view = latestShares.shares;
  expect(latestShares.shares).toBe(view);
  const dispose: unknown = Reflect.get(latestShares, Symbol.dispose);
  expect(typeof dispose).toBe("function");
  if (typeof dispose !== "function") throw new Error("The share set must own its lifetime.");
  Reflect.apply(dispose, latestShares, []);
  expect(latestShares.shares).toBeUndefined();
  expect(() => {
    Reflect.get(view ?? {}, "records");
  }).toThrow(expect.objectContaining({ code: "core.secret-value.wiped" }));
});
