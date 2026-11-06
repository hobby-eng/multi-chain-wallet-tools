// Known answers of the candidate lists that the Scanner opens, checked inside the Secret Vault
// before any list can be chosen: MnemoCode's WebAssembly is loaded and runs the startup checks of
// its candidates part (the MNCL format, age with a Scanner key and with a passphrase; every age
// operation also passes the part's own gate first), and a foreign file is refused from its first
// bytes, before its body is read. Public test data only.
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import { mnemocodeCode } from "@ckd/recovery-backup/mnemocode-engine.js";
import { loadMnemoCode } from "@ckd/recovery-backup/mnemocode-module.js";
import { CandidateListImport, type CandidateListFile } from "./candidate-list-import.js";

function expect(check: string, passed: boolean): void {
  if (!passed) throw new Error(`Discovery self-test failed: ${check}.`);
}

export async function runCandidateListSelfTest(): Promise<CryptoSelfTestReport> {
  const started = performance.now();
  (await loadMnemoCode()).selfCheckCandidates(false);
  const foreign = new Blob([Uint8Array.of(1, 2, 3)]);
  let bodyRead = false;
  const file: CandidateListFile = {
    size: foreign.size,
    slice: foreign.slice.bind(foreign),
    arrayBuffer: () => {
      bodyRead = true;
      return foreign.arrayBuffer();
    },
  };
  const lists = new CandidateListImport();
  let refused = false;
  let retained = false;
  try {
    await lists.open(file);
  } catch (cause) {
    // Refused at admission, before the body is read: the step, not one condition, is checked.
    if (!mnemocodeCode(cause)?.startsWith("core.candidate-file-refusal.")) throw cause;
    refused = true;
  } finally {
    retained = lists.count !== 0;
    lists.clear();
  }
  expect("candidate File/Blob header admission", refused && !bodyRead && !retained);
  return {
    passed: true,
    checks: [
      "Candidate list import (MnemoCode WebAssembly: MNCL, age)",
      "Candidate File/Blob admission",
    ],
    durationMs: Math.round(performance.now() - started),
  };
}
