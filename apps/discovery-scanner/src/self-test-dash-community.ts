import { runBip39SelfTest } from "@ckd/bip39-self-test";
import { runDashDerivationSelfTest } from "@ckd/dash-derivation-self-test";
import { combinedSelfTest } from "@ckd/verification/helpers.js";
import { runCandidateListSelfTest } from "./candidate-list-self-test.js";
import { createRecoverySelfTest } from "./recovery-self-test.js";

export const runRecoverySelfTest = createRecoverySelfTest(() =>
  combinedSelfTest([runBip39SelfTest, runDashDerivationSelfTest, runCandidateListSelfTest]),
);
