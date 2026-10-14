import { runCryptoSelfTest } from "@ckd/self-test";
import { combinedSelfTest } from "@ckd/verification/helpers.js";
import { runLocalSearchSelfTest } from "@ckd/verification/local-search-self-test.js";
import { runCandidateListSelfTest } from "./candidate-list-self-test.js";
import { createRecoverySelfTest } from "./recovery-self-test.js";

export type { RecoverySelfTestReport } from "./recovery-self-test.js";

export const runRecoverySelfTest = createRecoverySelfTest(() =>
  combinedSelfTest([runCryptoSelfTest, runCandidateListSelfTest, runLocalSearchSelfTest]),
);
