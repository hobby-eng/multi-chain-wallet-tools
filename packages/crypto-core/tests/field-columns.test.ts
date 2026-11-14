// The columns of a table of result rows (types.ts fieldColumns), which the Basic results table and
// the TSV export share.
import { describe, expect, it } from "vitest";
import { field, fieldColumns, type ResultField } from "@ckd/core/types.js";

/** A row of fields with these keys, each labelled with its key and the row's name. */
function row(name: string, keys: readonly string[]): ResultField[] {
  return keys.map((key) => field(key, `${key} of ${name}`, `${key}-${name}`));
}

/** The keys of the columns of `rows`. */
function columnsOf(rows: readonly (readonly ResultField[])[]): string[] {
  return fieldColumns(rows, ({ key }) => key).map(({ key }) => key);
}

/** Every order of `items`. */
function orders<Item>(items: readonly Item[]): Item[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, at) =>
    orders([...items.slice(0, at), ...items.slice(at + 1)]).map((rest) => [item, ...rest]),
  );
}

describe("the columns of result rows", () => {
  it("are the first row's fields when every row has the same ones", () => {
    expect(
      columnsOf([row("0", ["address", "publicKey"]), row("1", ["address", "publicKey"])]),
    ).toEqual(["address", "publicKey"]);
  });

  it("take a field that the first row lacks from a later row", () => {
    expect(columnsOf([row("0", []), row("1", ["address", "unifiedAddress"])])).toEqual([
      "address",
      "unifiedAddress",
    ]);
  });

  it("are the same whichever row comes first, a row of a Sapling index without an address among them", () => {
    const none = row("2", ["path", "diversifierIndex"]);
    const address = row("3", [
      "address",
      "unifiedAddress",
      "path",
      "unifiedTransparentAddress",
      "transparentReceiver",
      "diversifierIndex",
      "diversifier",
    ]);
    const expected = address.map(({ key }) => key);
    expect(columnsOf([none, address])).toEqual(expected);
    expect(columnsOf([address, none])).toEqual(expected);
  });

  it("keep one order of fields in any order of rows that each lack some of them", () => {
    const keys = ["a", "b", "c", "d", "e"];
    const rows = [
      row("full", keys),
      row("no b", ["a", "c", "d", "e"]),
      row("no a or e", ["b", "c", "d"]),
      row("only d", ["d"]),
      row("empty", []),
    ];
    for (const order of orders(rows)) expect(columnsOf(order)).toEqual(keys);
  });

  it("stand for the first field seen with each key", () => {
    const columns = fieldColumns(
      [row("0", ["path"]), row("1", ["address", "path"])],
      ({ key }) => key,
    );
    expect(columns.map(({ label }) => label)).toEqual(["address of 1", "path of 0"]);
  });

  it("are none for rows without fields", () => {
    expect(columnsOf([row("0", []), row("1", [])])).toEqual([]);
    expect(columnsOf([])).toEqual([]);
  });
});
