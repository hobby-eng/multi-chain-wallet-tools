import { expect, it } from "vitest";
import { runLocalSearchSelfTest } from "../src/local-search-self-test.js";

it("runs the same tiny local-search checks for startup and full self-tests", async () => {
  expect(await runLocalSearchSelfTest()).toEqual([
    "Local search concurrency admission",
    "Local search range admission",
    "Local search complete ordered results",
    "Local search final job cancellation",
  ]);
});
