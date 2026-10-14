import { describe, expect, it } from "vitest";
import { CandidateListImport } from "../../../apps/discovery-scanner/src/candidate-list-import.js";
import { encodeCandidateList } from "../../../packages/recovery-mnemocode/source/core/candidate-list.js";
import { encryptCandidates } from "../../../packages/recovery-mnemocode/source/core/candidate-encryption.js";

describe("AUD-022 candidate import revision ownership", () => {
  it("keeps the list cleared when an earlier decrypt finishes", async () => {
    const lists = new CandidateListImport();
    const plain = encodeCandidateList({ records: [{ entropy: new Uint8Array(16) }] });
    const file = await encryptCandidates(plain, await lists.recipient());
    plain.fill(0);
    const opening = lists.open(file);
    lists.clear();
    const cancellation = await opening.then(
      () => null,
      (error: unknown) => error,
    );
    if (cancellation !== null) {
      expect(cancellation).toBeInstanceOf(Error);
      expect((cancellation as Error).message).toMatch(/removed while|cancel|abort/iu);
    }
    const countAfterClear = lists.count;
    lists.clear();
    expect(countAfterClear, "Clear must invalidate an in-flight list import").toBe(0);
  });
});
