import { expect, it } from "vitest";
import { DerivedPrivateKey } from "../src/derived-private-key.js";
import { DerivationResultFixture } from "@ckd/test-support/derivation-result.js";

const ADDRESS = "synthetic public address";
const KEY = "0".repeat(63) + "1";

function fixture() {
  const result = DerivationResultFixture.create();
  const field = result.rows[0]!.advanced[0]!;
  field.key = "privateKeyHex";
  field.value = KEY;
  return { result, field };
}

it.each(["privateKeyHex", "childPrivateKey"])(
  "lends exact %s bytes and only public field snapshots until disposal",
  (key) => {
    const { result, field } = fixture();
    field.key = key;
    const publicField = {
      key: "scriptPubKey",
      label: "Script",
      value: "synthetic script",
      secret: false,
    };
    result.rows[0]!.advanced.push(publicField);
    const owner = new DerivedPrivateKey(result, ADDRESS);
    const borrowed = owner.bytes;
    expect(owner.hex).toBe(KEY);
    expect(borrowed).toEqual(Uint8Array.from([...Array<number>(31).fill(0), 1]));
    expect(owner.fields.every((view) => !view.secret)).toBe(true);
    expect(owner.fields).not.toContain(field);
    expect(owner.fields.find((view) => view.key === "scriptPubKey")?.value).toBe(
      "synthetic script",
    );
    expect(publicField.value).toBe("");
    expect(field.value).toBe("");
    expect(result.rows).toHaveLength(0);
    owner[Symbol.dispose]();
    expect(borrowed.every((byte) => byte === 0)).toBe(true);
    expect(field.value).toBe("");
    expect(result.rows).toHaveLength(0);
    for (const read of [() => owner.hex, () => owner.bytes, () => owner.fields])
      expect(read).toThrow(expect.objectContaining({ code: "derivation.result.retired" }));
    owner.wipe();
  },
);

it.each([
  { mode: "address", code: "derivation.key.address" },
  { mode: "missing", code: "derivation.key.unavailable" },
  { mode: "public", code: "derivation.key.material" },
  { mode: "non-hex", code: "derivation.key.material" },
  { mode: "zero", code: "derivation.key.material" },
  { mode: "too-large", code: "derivation.key.material" },
])(
  "refuses $mode material without retaining its result or repeating its contents",
  ({ mode, code }) => {
    const { result, field } = fixture();
    if (mode === "missing") field.key = "unsupported";
    if (mode === "public") field.secret = false;
    if (mode === "non-hex") field.value = "synthetic private malformed key";
    if (mode === "zero") field.value = "0".repeat(64);
    if (mode === "too-large") field.value = "f".repeat(64);
    expect(
      () => new DerivedPrivateKey(result, mode === "address" ? "another address" : ADDRESS),
    ).toThrow(expect.objectContaining({ code, message: code }));
    expect(field.value).toBe("");
    expect(result.rows).toHaveLength(0);
  },
);

it("refuses to lend a key when retiring its consumed result fails", () => {
  const { result, field } = fixture();
  DerivationResultFixture.refusePublicWrite(result, "readonly");
  expect(() => new DerivedPrivateKey(result, ADDRESS)).toThrow(
    expect.objectContaining({ code: "derivation.result.property" }),
  );
  expect(field.value).toBe("");
  expect(result.rows).toHaveLength(0);
});

it("releases the same key/result pair when an asynchronous consumer fails", async () => {
  const { result, field } = fixture();
  let borrowed: Uint8Array | undefined;
  const consume = async () => {
    using key = new DerivedPrivateKey(result, ADDRESS);
    borrowed = key.bytes;
    await Promise.resolve();
    throw new Error("Synthetic asynchronous consumer refusal.");
  };
  await expect(consume()).rejects.toThrow("Synthetic asynchronous consumer refusal.");
  expect(borrowed?.every((byte) => byte === 0)).toBe(true);
  expect(field.value).toBe("");
});
