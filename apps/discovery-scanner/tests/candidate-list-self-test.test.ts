import { describe, expect, it } from "vitest";
import { runCandidateListSelfTest } from "../src/candidate-list-self-test.js";

describe("the Scanner's candidate list self-test", () => {
  it("opens the pinned list, refuses another key and checks scrypt", async () => {
    expect((await runCandidateListSelfTest()).checks).toEqual([
      "Candidate list import (age X25519, MNCL)",
      "Candidate File/Blob admission",
      "scrypt (RFC 7914)",
    ]);
  });
});
