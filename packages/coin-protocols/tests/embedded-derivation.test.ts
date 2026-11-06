import { expect, it } from "vitest";
import { EmbeddedDerivation } from "../src/coins/embedded-derivation.js";

it("admits the existing embedded-view endpoints and refuses invalid counts", () => {
  expect(EmbeddedDerivation.maximumRows).toBe(200);
  expect(() => EmbeddedDerivation.admit(1)).not.toThrow();
  expect(() => EmbeddedDerivation.admit(200)).not.toThrow();
  for (const count of [0, -1, 201, 1.5, Number.NaN, Number.POSITIVE_INFINITY])
    expect(() => EmbeddedDerivation.admit(count)).toThrow(
      expect.objectContaining({ code: "derivation.embedded.count" }),
    );
});
