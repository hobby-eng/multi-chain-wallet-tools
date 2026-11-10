import { describe, expect, it } from "vitest";
import { runPublicInputGuardSelfTest } from "../src/public-input-guard-self-test.js";

describe("the public-input guard self-test", () => {
  it("passes: secrets refused, public values accepted", () => {
    expect(runPublicInputGuardSelfTest()).toEqual([
      "Public-input guard refuses phrases, WIF, extended private keys, Ed25519 secret keys and secret seeds",
    ]);
  });
});
