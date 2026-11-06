import { describe, expect, it } from "vitest";
import { DESCRIPTOR_FRAGMENTS } from "../src/descriptor-fragments.js";

describe("descriptor fragment groups refuse unknown catalog access", () => {
  it("keeps an unknown group distinct from a fragment absent from a known group", () => {
    expect(DESCRIPTOR_FRAGMENTS.has("opaquePaths", "pk")).toBe(false);
    for (const operation of [
      DESCRIPTOR_FRAGMENTS.has.bind(DESCRIPTOR_FRAGMENTS),
      DESCRIPTOR_FRAGMENTS.names.bind(DESCRIPTOR_FRAGMENTS),
    ])
      expect(() => {
        Reflect.apply(operation, undefined, ["synthetic-unknown-group", "pk"]);
      }).toThrow(expect.objectContaining({ code: "descriptor.fragment.group" }));
  });
});
