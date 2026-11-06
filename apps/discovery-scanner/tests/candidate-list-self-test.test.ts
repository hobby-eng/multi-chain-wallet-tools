import { describe, expect, it } from "vitest";
import { runCandidateListSelfTest } from "../src/candidate-list-self-test.js";

describe("the Scanner's candidate list self-test", () => {
  it("runs MnemoCode's candidate checks and refuses a foreign file from its header", async () => {
    expect((await runCandidateListSelfTest()).checks).toEqual([
      "Candidate list import (MnemoCode WebAssembly: MNCL, age)",
      "Candidate File/Blob admission",
    ]);
  });
});
