import { expect, it } from "vitest";
import { DerivedPrivateKey } from "../src/derived-private-key.js";
import { field, paymentAddressField } from "../src/types.js";
import { DerivationResultFixture } from "@ckd/test-support/derivation-result.js";

const KEY = "0".repeat(63) + "1";
const ADDRESS = "synthetic public address";
const OTHER = "synthetic other form";

/** A row with its private key and one more field in Advanced mode. */
function rowWith(extra: ReturnType<typeof field>) {
  const result = DerivationResultFixture.create();
  const row = result.rows[0]!;
  const privateField = row.advanced[0]!;
  privateField.key = "childPrivateKey";
  privateField.value = KEY;
  row.advanced.push(extra);
  return result;
}

it("binds the key to the clicked payment field, such as Bitcoin Cash's legacy address", () => {
  const result = rowWith(paymentAddressField("legacyAddress", "Legacy", OTHER));
  using key = new DerivedPrivateKey(result, OTHER, "legacyAddress");
  expect(key.hex).toBe(KEY);
});

it("binds the row's address field by default, as BIP38 asks", () => {
  using key = new DerivedPrivateKey(rowWith(field("publicKey", "Key", "public")), ADDRESS);
  expect(key.hex).toBe(KEY);
});

it.each([
  [
    "another field's form under the address key, such as Litecoin's old 3… form",
    paymentAddressField("oldP2shAddress", "Old form", OTHER),
    OTHER,
    "address",
  ],
  [
    "a payment field that holds another value",
    paymentAddressField("legacyAddress", "Legacy", OTHER),
    ADDRESS,
    "legacyAddress",
  ],
  [
    "a public field that is no payment address",
    field("publicKey", "Key", OTHER),
    OTHER,
    "publicKey",
  ],
  [
    "a secret field",
    { ...paymentAddressField("legacyAddress", "Legacy", OTHER), secret: true },
    OTHER,
    "legacyAddress",
  ],
])("never binds the key to %s", (_name, extra, address, addressKey) => {
  expect(() => new DerivedPrivateKey(rowWith(extra), address, addressKey)).toThrow(
    expect.objectContaining({ code: "derivation.key.address" }),
  );
});
