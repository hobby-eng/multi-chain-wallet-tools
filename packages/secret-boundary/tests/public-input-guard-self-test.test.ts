import { describe, expect, it } from "vitest";
import { runPublicInputGuardSelfTest } from "../src/public-input-guard-self-test.js";

describe("the public-input guard self-test", () => {
  it("passes: secrets refused, a public address accepted", () => {
    expect(runPublicInputGuardSelfTest()).toEqual([
      "Public-input guard refuses phrases, WIF and extended private keys",
    ]);
  });
});
