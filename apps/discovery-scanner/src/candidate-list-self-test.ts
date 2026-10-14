// Known answers of the candidate lists that the Scanner opens, checked inside the Secret Vault
// before any list can be chosen: MnemoCode's own startup checks of the MNCL format and of its
// encryption (a list saved to a key opens with it and is refused by another; a passphrase list
// opens), and scrypt, which a list saved under a passphrase relies on, against RFC 7914's
// published output. Public test data only.
import { scrypt } from "@noble/hashes/scrypt.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import { checkCandidateEncryptionQuick } from "../../../packages/recovery-mnemocode/source/core/candidate-encryption-self-test.js";
import { checkCandidateListStartup } from "../../../packages/recovery-mnemocode/source/core/candidate-list-self-test.js";
import { CandidateFileRefused } from "../../../packages/recovery-mnemocode/source/core/candidate-encryption.js";
import { CandidateListImport, type CandidateListFile } from "./candidate-list-import.js";

/** RFC 7914, section 12: scrypt of an empty password and salt, N = 16, r = 1, p = 1. */
const RFC7914_OUTPUT =
  "77d6576238657b203b19ca42c18a0497f16b4844e3074ae8dfdffa3fede21442" +
  "fcd0069ded0948f8326a753a0fc81f17e8d3e0fb2e0d3628cf35e20c38d18906";

function expect(check: string, passed: boolean): void {
  if (!passed) throw new Error(`Discovery self-test failed: ${check}.`);
}

export async function runCandidateListSelfTest(): Promise<CryptoSelfTestReport> {
  const started = performance.now();
  checkCandidateListStartup();
  await checkCandidateEncryptionQuick();
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
    if (!(cause instanceof CandidateFileRefused) || cause.problem !== "unsupported") throw cause;
    refused = true;
  } finally {
    retained = lists.count !== 0;
    lists.clear();
  }
  expect("candidate File/Blob header admission", refused && !bodyRead && !retained);
  const derived = scrypt(new Uint8Array(0), new Uint8Array(0), { N: 16, r: 1, p: 1, dkLen: 64 });
  expect("scrypt RFC 7914 vector", bytesToHex(derived) === RFC7914_OUTPUT);
  return {
    passed: true,
    checks: [
      "Candidate list import (age X25519, MNCL)",
      "Candidate File/Blob admission",
      "scrypt (RFC 7914)",
    ],
    durationMs: Math.round(performance.now() - started),
  };
}
