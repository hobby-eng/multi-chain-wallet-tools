import { expect, it } from "vitest";
import { DerivationSecrets, clearDerivationResult } from "../src/secrets.js";
import { DerivationResultFixture } from "@ckd/test-support/derivation-result.js";

it("releases available private targets and healthy neighbors when a native graph getter fails", () => {
  const broken = DerivationSecrets.take(DerivationResultFixture.create());
  const healthy = DerivationSecrets.take(DerivationResultFixture.create());
  const fields = [broken.rows[0]!.advanced[0]!, healthy.rows[0]!.advanced[0]!];
  DerivationResultFixture.refuseGroupsRead(broken);
  expect(() => DerivationSecrets.clearAll([broken, healthy])).toThrow(
    expect.objectContaining({
      code: "derivation.result.property",
      message: "derivation.result.property",
    }),
  );
  expect(fields.every((field) => field.value === "")).toBe(true);
  for (const field of fields)
    expect(() => {
      field.value = "synthetic late private";
    }).toThrow(expect.objectContaining({ code: "derivation.result.retired" }));
});

it("joins recursive cleanup without invoking a native setter twice", () => {
  const result = DerivationSecrets.take(DerivationResultFixture.create());
  const held = result.rows[0]!.advanced[0]!;
  let calls = 0;
  Object.defineProperty(result.rows[0]!.basic[0]!, "value", {
    set: () => {
      calls += 1;
      if (calls > 1) throw new Error("Synthetic recursive native setter.");
      DerivationSecrets.clear(result);
    },
  });
  expect(() => DerivationSecrets.clear(result)).not.toThrow();
  expect(calls).toBe(1);
  expect(held.value).toBe("");
  expect(() => {
    held.value = "synthetic late private";
  }).toThrow(expect.objectContaining({ code: "derivation.result.retired" }));
});

it.each(["one", "all"])(
  "retires private owners when a public setter mutates %s container graph",
  (mode) => {
    const first = DerivationSecrets.take(DerivationResultFixture.create());
    const later = DerivationSecrets.take(DerivationResultFixture.create());
    const held = first.rows[0]!.advanced[0]!;
    const laterHeld = later.rows[0]!.advanced[0]!;
    const publicField = first.rows[0]!.basic[0]!;
    first.basicSummary.unshift(publicField);
    Object.defineProperty(publicField, "value", {
      set: () => {
        first.rows.length = 0;
        if (mode === "all") later.rows.length = 0;
      },
    });
    if (mode === "all") DerivationSecrets.clearAll([first, later]);
    else DerivationSecrets.clear(first);
    expect(held.value).toBe("");
    expect(() => {
      held.value = "synthetic late private";
    }).toThrow(expect.objectContaining({ code: "derivation.result.retired" }));
    if (mode === "all") {
      expect(laterHeld.value).toBe("");
      expect(() => {
        laterHeld.value = "synthetic late private";
      }).toThrow(expect.objectContaining({ code: "derivation.result.retired" }));
    } else DerivationSecrets.clear(later);
  },
);

it.each(["readonly", "throwing-setter"] as const)(
  "retires every other private owner when a %s native property refuses cleanup",
  (mode) => {
    const result = DerivationResultFixture.create();
    DerivationResultFixture.refusePublicWrite(result, mode);
    DerivationSecrets.take(result);
    const fields = [result.basicSummary[1]!, result.rows[0]!.advanced[0]!];
    const descriptors = result.accountDescriptors!;
    const watchOnly = result.watchOnly!;
    expect(() => clearDerivationResult(result)).toThrow(
      expect.objectContaining({ code: "derivation.result.property" }),
    );
    expect(fields.every((field) => field.value === "")).toBe(true);
    expect(descriptors.privateText).toBe("");
    expect(watchOnly.text).toBe("");
    expect(result.rows).toHaveLength(0);
    expect(result.basicSummary).toHaveLength(0);
  },
);

it("completes admission rollback even when an earlier public field refuses cleanup", () => {
  const result = DerivationResultFixture.create();
  DerivationResultFixture.refusePublicWrite(result, "readonly");
  const privateField = result.basicSummary[1]!;
  Object.assign(result.summary[0]!, { value: 42 });
  expect(() => DerivationSecrets.take(result)).toThrow(
    expect.objectContaining({ code: "derivation.result.property" }),
  );
  expect(privateField.value).toBe("");
  expect(result.rows).toHaveLength(0);
});

it("preserves exact native DTO output and retires every private or privacy-sensitive field", () => {
  const result = DerivationResultFixture.create();
  const expected = structuredClone(result);
  const row = result.rows[0]!;
  const fields = [
    ...result.basicSummary,
    ...result.summary,
    ...row.basic,
    ...row.advanced,
    ...row.groups![0]!.basic,
    ...row.groups![0]!.advanced,
  ];
  const descriptors = result.accountDescriptors!;
  const watchOnly = result.watchOnly!;
  expect(DerivationSecrets.take(result)).toBe(result);
  expect(structuredClone(result)).toEqual(expected);
  clearDerivationResult(result);
  expect(fields.every((field) => field.value === "")).toBe(true);
  expect(watchOnly.text).toBe("");
  expect(descriptors.privateText).toBe("");
  expect(result.rows).toHaveLength(0);
  for (const target of [fields.find((field) => field.secret)!, watchOnly, descriptors]) {
    const property =
      target === watchOnly ? "text" : target === descriptors ? "privateText" : "value";
    expect(() => Reflect.set(target, property, "synthetic retired text")).toThrow(
      expect.objectContaining({ code: "derivation.result.retired" }),
    );
  }
});

it("owns a native structured clone independently from the sender's lifetime", () => {
  const sender = DerivationSecrets.take(DerivationResultFixture.create());
  const receiver = DerivationSecrets.take(structuredClone(sender));
  const field = receiver.rows[0]!.advanced[0]!;
  clearDerivationResult(sender);
  expect(field.value).toBe("synthetic private\r\n\ud800");
  clearDerivationResult(receiver);
  expect(field.value).toBe("");
});

it("replaces active private text without changing the field interface or opaque code units", () => {
  const result = DerivationSecrets.take(DerivationResultFixture.create());
  const field = result.rows[0]!.advanced[0]!;
  field.value = "\uFEFFsynthetic second\udfff";
  expect(field.value).toBe("\uFEFFsynthetic second\udfff");
  DerivationSecrets.take(result);
  expect(field.value).toBe("\uFEFFsynthetic second\udfff");
  clearDerivationResult(result);
  field.value = "";
  expect(field.value).toBe("");
});

it("keeps transferred rows live when the emptied source batch is released", () => {
  const batch = DerivationSecrets.take(DerivationResultFixture.create());
  const destination = DerivationSecrets.take(DerivationResultFixture.create());
  const rows = batch.rows.splice(0);
  const transferred = rows[0]!.advanced[0]!;
  destination.rows.push(...rows);
  clearDerivationResult(batch);
  expect(transferred.value).toBe("synthetic private\r\n\ud800");
  clearDerivationResult(destination);
  expect(transferred.value).toBe("");
});

it("clears earlier private owners when later input fails ownership admission", () => {
  const result = DerivationResultFixture.create();
  const earlier = result.basicSummary[0]!;
  Object.assign(result.summary[0]!, { value: 42 });
  expect(() => DerivationSecrets.take(result)).toThrow(
    expect.objectContaining({ code: "derivation.result.text" }),
  );
  expect(earlier.value).toBe("");
  expect(result.rows).toHaveLength(0);
  expect(() => {
    earlier.value = "synthetic late private";
  }).toThrow(expect.objectContaining({ code: "derivation.result.retired" }));
});
